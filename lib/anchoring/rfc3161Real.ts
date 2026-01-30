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
  // TSTInfo structure: SEQUENCE { version, policy, messageImprint, serialNumber, ... }
  // We need to find the serialNumber field which comes after messageImprint
  // Skip the first few INTEGERs and look for one that's 4-20 bytes (typical serial)
  
  let integerCount = 0;
  
  for (let i = 0; i < tokenBytes.length - 2; i++) {
    if (tokenBytes[i] === 0x02) { // INTEGER tag
      const length = tokenBytes[i + 1];
      
      integerCount++;
      
      // Serial number is typically the 2nd or 3rd INTEGER, and 4-20 bytes long
      // Skip version (1 byte) and small integers
      if (integerCount >= 2 && length >= 4 && length <= 20 && i + 2 + length <= tokenBytes.length) {
        const serialBytes = tokenBytes.slice(i + 2, i + 2 + length);
        const hex = Array.from(serialBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase();
        
        // Return first reasonable serial we find
        if (hex.length >= 8) { // At least 4 bytes = 8 hex chars
          return hex;
        }
      }
    }
  }
  
  return 'UNKNOWN';
}

function extractTimestampFromToken(tokenBytes: Uint8Array): string {
  // Look for GeneralizedTime (0x18) - format: YYYYMMDDHHmmss[.fff]Z
  for (let i = 0; i < tokenBytes.length - 15; i++) {
    if (tokenBytes[i] === 0x18) { // GeneralizedTime tag
      const length = tokenBytes[i + 1];
      if (length >= 13 && length <= 23 && i + 2 + length <= tokenBytes.length) {
        const timeBytes = tokenBytes.slice(i + 2, i + 2 + length);
        const timeStr = new TextDecoder('utf-8', { fatal: false }).decode(timeBytes);
        
        // Parse GeneralizedTime: YYYYMMDDHHmmssZ or YYYYMMDDHHmmss.fffZ
        const match = timeStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
        if (match) {
          const [_, year, month, day, hour, min, sec] = match;
          return `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
        }
      }
    }
  }
  
  // Fallback: look for UTCTime (0x17) - format: YYMMDDHHmmssZ
  for (let i = 0; i < tokenBytes.length - 13; i++) {
    if (tokenBytes[i] === 0x17) {
      const length = tokenBytes[i + 1];
      if (length >= 11 && length <= 17 && i + 2 + length <= tokenBytes.length) {
        const timeBytes = tokenBytes.slice(i + 2, i + 2 + length);
        const timeStr = new TextDecoder('utf-8', { fatal: false }).decode(timeBytes);
        
        const match = timeStr.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
        if (match) {
          const [_, yy, month, day, hour, min, sec] = match;
          const year = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
          return `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
        }
      }
    }
  }
  
  // Last resort: use current time
  console.warn('[RFC3161] Could not extract timestamp from token, using current time');
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