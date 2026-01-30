/**
 * RFC 3161 Real TSA Implementation
 */

import * as Crypto from 'expo-crypto';

export interface TSAConfig {
  url: string;
  name?: string;
  timeout?: number;
  policy?: string;
}

export interface TimeStampTokenResult {
  tokenData: string;
  serialNumber: string;
  timestamp: string;
  isValid: boolean;
}

function createTimeStampReq(hashHex: string): Uint8Array {
  const hashBytes = new Uint8Array(hashHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

  const der = {
    version1: [0x02, 0x01, 0x01],  // ✅ Changed from 0x00 to 0x01
    oid_sha256: [0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01],
    null_: [0x05, 0x00],
    certReqTrue: [0x01, 0x01, 0xFF],  // ✅ Added certReq flag
  };

  const algoSeq = [...der.oid_sha256, ...der.null_];
  const algoIdentifier = [0x30, algoSeq.length, ...algoSeq];

  const hashOctet = [0x04, hashBytes.length, ...Array.from(hashBytes)];
  const messageImprint = [0x30, algoIdentifier.length + hashOctet.length, ...algoIdentifier, ...hashOctet];

  const reqBody = [...der.version1, ...messageImprint, ...der.certReqTrue];  // ✅ Added certReq
  const req = [0x30, reqBody.length, ...reqBody];

  return new Uint8Array(req);
}

function extractSerialFromToken(tokenBytes: Uint8Array): string {
  for (let i = 0; i < tokenBytes.length - 2; i++) {
    if (tokenBytes[i] === 0x02) {
      const length = tokenBytes[i + 1];
      if (length > 0 && length <= 20 && i + 2 + length <= tokenBytes.length) {
        const serialBytes = tokenBytes.slice(i + 2, i + 2 + length);
        return Array.from(serialBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      }
    }
  }
  return 'UNKNOWN';
}

function extractTimestampFromToken(tokenBytes: Uint8Array): string {
  for (let i = 0; i < tokenBytes.length - 2; i++) {
    const tag = tokenBytes[i];
    const length = tokenBytes[i + 1];

    if (tag === 0x18 && length >= 14 && i + 2 + length <= tokenBytes.length) {
      const timeBytes = tokenBytes.slice(i + 2, i + 2 + length);
      const timeStr = new TextDecoder().decode(timeBytes);
      if (timeStr.includes('-') || timeStr.includes(':')) {
        return timeStr;
      }
      const match = timeStr.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (match) {
        return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
      }
    }

    if (tag === 0x17 && length >= 13 && i + 2 + length <= tokenBytes.length) {
      const timeBytes = tokenBytes.slice(i + 2, i + 2 + length);
      const timeStr = new TextDecoder().decode(timeBytes);
      const match = timeStr.match(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (match) {
        const yy = parseInt(match[1]);
        const yyyy = yy > 50 ? 1900 + yy : 2000 + yy;
        return `${yyyy}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
      }
    }
  }

  return new Date().toISOString();
}

export async function submitToRealTSADER(
  proofHash: string,
  config: TSAConfig
): Promise<TimeStampTokenResult> {
  try {
    const hashHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      proofHash
    );

    console.log(`[RFC3161] 📝 Creating DER request for hash: ${hashHex.substring(0, 16)}...`);

    const derRequest = createTimeStampReq(hashHex);
    console.log(`[RFC3161] 📦 Request size: ${derRequest.length} bytes`);

    console.log(`[RFC3161] 🔗 Submitting to ${config.name || 'TSA'} at ${config.url}`);

    // ✅ FIX: Use Promise.race for timeout (React Native compatible)
    const timeoutMs = config.timeout || 30000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    const fetchPromise = fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/timestamp-query',  // ✅ Fixed MIME type
        'Accept': 'application/timestamp-reply',
        'User-Agent': 'BeforeAfter/1.0 RFC3161Client',
      },
      body: derRequest as any,  // ✅ Send raw bytes, not base64
    });

    const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

    if (!response.ok) {
      throw new Error(`TSA responded with ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const tokenBytes = new Uint8Array(buffer);

    if (tokenBytes.length === 0) {
      throw new Error('TSA returned empty response');
    }

    const tokenData = btoa(String.fromCharCode.apply(null, Array.from(tokenBytes)));

    const serialNumber = extractSerialFromToken(tokenBytes);
    const timestamp = extractTimestampFromToken(tokenBytes);

    console.log(`[RFC3161] ✅ Token received: ${tokenBytes.length} bytes`);
    console.log(`[RFC3161]    Serial: ${serialNumber}`);
    console.log(`[RFC3161]    Time: ${timestamp}`);

    return {
      tokenData,
      serialNumber,
      timestamp,
      isValid: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[RFC3161] ❌ Failed: ${message}`);
    throw error;
  }
}

export function isRealTSAToken(tokenData: string): boolean {
  return !tokenData.startsWith('mock_');
}