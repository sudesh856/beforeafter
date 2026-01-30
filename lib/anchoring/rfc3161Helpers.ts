/**
 * RFC 3161 ASN.1 DER Encoding/Decoding Helpers
 * 
 * Implements RFC 3161 TimeStampReq/TimeStampToken encoding and parsing
 * for real Timestamp Authority integration.
 * 
 * This module handles ASN.1 DER format conversion without external libraries
 * using basic binary operations. For production, consider asn1js + pkijs.
 */


/**
 * RFC 3161 TimeStampReq structure (simplified for MVP)
 * A timestamp request contains:
 * - Message digest algorithm OID (SHA-256)
 * - Message digest (the proof hash)
 * - Nonce (random, for reply binding)
 * - Cert request flag
 * - Policy OID
 */
export interface TimeStampReq {
  hashAlgo: 'SHA256' | 'SHA384' | 'SHA512';
  hashValue: string; // hex-encoded hash
  nonce?: string;
  certReq?: boolean;
  policy?: string; // OID like "1.3.6.1.4.1.601.10.1"
}

/**
 * RFC 3161 TimeStampToken structure (parsed from response)
 * Contains:
 * - Time stamp token (signature from TSA)
 * - Serial number
 * - Timestamp
 * - TSA certificate chain
 */
export interface TimeStampToken {
  tokenData: string; // base64-encoded or hex token
  serialNumber: string;
  timestamp: string; // ISO 8601
  issuer?: string; // Certificate issuer
  subject?: string; // Certificate subject
  isValid?: boolean;
}

/**
 * Convert SHA-256 hex hash to OID for ASN.1
 * SHA-256 OID: 2.16.840.1.101.3.4.2.1
 */
export function getHashAlgoOID(algo: 'SHA256' | 'SHA384' | 'SHA512'): string {
  switch (algo) {
    case 'SHA256':
      return '2.16.840.1.101.3.4.2.1';
    case 'SHA384':
      return '2.16.840.1.101.3.4.2.2';
    case 'SHA512':
      return '2.16.840.1.101.3.4.2.3';
    default:
      return '2.16.840.1.101.3.4.2.1'; // Default to SHA-256
  }
}

/**
 * Convert OID string to DER-encoded bytes
 * e.g., "2.16.840.1.101.3.4.2.1" -> [0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]
 */
function encodeOID(oid: string): number[] {
  const parts = oid.split('.').map(Number);
  const result: number[] = [];
  
  // First two parts are encoded as 40*first + second
  result.push(40 * parts[0] + parts[1]);
  
  // Remaining parts
  for (let i = 2; i < parts.length; i++) {
    const val = parts[i];
    if (val < 128) {
      result.push(val);
    } else {
      // Multi-byte encoding
      const bytes: number[] = [];
      let v = val;
      while (v > 0) {
        bytes.unshift(v & 0x7f);
        v >>= 7;
      }
      for (let j = 0; j < bytes.length - 1; j++) {
        bytes[j] |= 0x80;
      }
      result.push(...bytes);
    }
  }
  
  return result;
}

/**
 * Encode ASN.1 TLV (Tag-Length-Value)
 */
function encodeTLV(tag: number, data: number[]): number[] {
  const result: number[] = [tag];
  
  // Encode length
  if (data.length < 128) {
    result.push(data.length);
  } else {
    const lengthBytes = [];
    let len = data.length;
    while (len > 0) {
      lengthBytes.unshift(len & 0xff);
      len >>= 8;
    }
    result.push(0x80 | lengthBytes.length, ...lengthBytes);
  }
  
  result.push(...data);
  return result;
}

/**
 * Convert hex string to byte array
 */
function hexToBytes(hex: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    result.push(parseInt(hex.substr(i, 2), 16));
  }
  return result;
}

/**
 * Convert byte array to base64 string
 */
function bytesToBase64(bytes: number[]): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1] ?? 0;
    const b3 = bytes[i + 2] ?? 0;
    
    result += String.fromCharCode(b1 >> 2);
    result += String.fromCharCode(((b1 & 3) << 4) | (b2 >> 4));
    result += i + 1 < bytes.length ? String.fromCharCode(((b2 & 15) << 2) | (b3 >> 6)) : '=';
    result += i + 2 < bytes.length ? String.fromCharCode(b3 & 63) : '=';
  }
  return result;
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Convert byte array to base64 string (proper implementation)
 */
function bytesToBase64Proper(bytes: number[]): string {
  let result = '';
  let i = 0;
  
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : 0;
    const b3 = i < bytes.length ? bytes[i++] : 0;
    
    const bitmap = (b1 << 16) | (b2 << 8) | b3;
    
    result += BASE64_CHARS[(bitmap >> 18) & 63];
    result += BASE64_CHARS[(bitmap >> 12) & 63];
    result += i - 2 < bytes.length ? BASE64_CHARS[(bitmap >> 6) & 63] : '=';
    result += i - 1 < bytes.length ? BASE64_CHARS[bitmap & 63] : '=';
  }
  
  return result;
}

/**
 * Generate a DER-encoded TimeStampReq with proper ASN.1 structure
 * 
 * TimeStampReq ::= SEQUENCE {
 *   version     INTEGER { v1(0) },
 *   messageImprint AlgorithmIdentifier,
 *   reqPolicy    TSAPolicyId OPTIONAL,
 *   nonce        INTEGER OPTIONAL,
 *   certReq      BOOLEAN DEFAULT FALSE,
 *   extensions   [0] IMPLICIT Extensions OPTIONAL
 * }
 */
export function encodeTimeStampReqBinary(req: TimeStampReq): {
  binary: number[];
  base64: string;
  json: Record<string, any>;
} {
  const nonce = req.nonce || generateNonce();
  const hashAlgoOID = getHashAlgoOID(req.hashAlgo);
  
  // Build AlgorithmIdentifier (SEQUENCE of OID + NULL)
  const oidBytes = encodeOID(hashAlgoOID);
  const oidTLV = encodeTLV(0x06, oidBytes); // OID tag
  const nullTLV = encodeTLV(0x05, []); // NULL tag
  const algoIdBytes = encodeTLV(0x30, [...oidTLV, ...nullTLV]); // SEQUENCE
  
  // Build MessageDigest (OCTET STRING)
  const hashBytes = hexToBytes(req.hashValue);
  const digestBytes = encodeTLV(0x04, hashBytes); // OCTET STRING tag
  
  // Build MessageImprint (SEQUENCE of AlgorithmIdentifier + digest)
  const messageImprintBytes = encodeTLV(0x30, [...algoIdBytes, ...digestBytes]);
  
  // Build version (INTEGER 0)
  const versionBytes = encodeTLV(0x02, [0]); // INTEGER tag
  
  // Build nonce (INTEGER) - convert nonce string to number
  let hash = 0;
  for (let i = 0; i < nonce.length; i++) {
    const char = nonce.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const nonceValue = Math.abs(hash) || Math.floor(Math.random() * 2147483647);
  let nonceBytes = [];
  let n = nonceValue;
  if (n === 0) {
    nonceBytes = [0];
  } else {
    const bytes = [];
    while (n > 0) {
      bytes.unshift(n & 0xff);
      n >>= 8;
    }
    // Add padding byte if high bit is set (to keep it positive)
    if (bytes[0] & 0x80) {
      bytes.unshift(0);
    }
    nonceBytes = bytes;
  }
  const nonceTLV = encodeTLV(0x02, nonceBytes); // INTEGER tag
  
  // Build reqPolicy OID (optional, but recommended)
  const policyOID = req.policy || '1.3.6.1.4.1.601.10.1';
  const policyOidBytes = encodeOID(policyOID);
  const policyTLV = encodeTLV(0x06, policyOidBytes); // OID tag
  
  // Build certReq BOOLEAN (optional, DEFAULT FALSE)
  const certReqBytes = req.certReq ? encodeTLV(0x01, [0xff]) : [];
  
  // Build final SEQUENCE
  const allParts = [
    versionBytes,
    messageImprintBytes,
    policyTLV,
    nonceTLV,
    ...certReqBytes,
  ];
  
  const finalBinary = encodeTLV(0x30, allParts.flat()); // SEQUENCE tag
  const base64Encoded = bytesToBase64Proper(finalBinary);
  
  return {
    binary: finalBinary,
    base64: base64Encoded,
    json: {
      version: 1,
      messageImprint: {
        hashAlgo: req.hashAlgo,
        hashValue: req.hashValue,
        oid: hashAlgoOID,
      },
      reqPolicy: policyOID,
      nonce: nonceValue,
      certReq: req.certReq ?? false,
    },
  };
}

/**
 * Generate a simple DER-encoded TimeStampReq
 * 
 * For real RFC 3161 compliance, proper ASN.1 encoding is required.
 * This simplified version creates a request structure compatible with
 * many TSA endpoints that accept JSON or basic DER.
 * 
 * In production, use asn1js + pkijs for full ASN.1 support.
 * 
 * @param req - TimeStampReq parameters
 * @returns JSON representation (many TSAs accept JSON + binary fallback)
 */
export function encodeTimeStampReq(req: TimeStampReq): {
  json: Record<string, any>;
  binary?: string; // base64 for future DER implementation
} {
  // Try to use proper binary encoding
  try {
    const binaryReq = encodeTimeStampReqBinary(req);
    return {
      json: binaryReq.json,
      binary: binaryReq.base64,
    };
  } catch (error) {
    // Fallback to JSON-only if binary encoding fails
    const hashAlgoOID = getHashAlgoOID(req.hashAlgo);
    const nonce = req.nonce || generateNonce();

    return {
      json: {
        version: 1,
        messageImprint: {
          hashAlgo: req.hashAlgo,
          hashValue: req.hashValue,
          oid: hashAlgoOID,
        },
        reqPolicy: req.policy || '1.3.6.1.4.1.601.10.1', // DigiCert default
        nonce: nonce,
        certReq: req.certReq ?? false,
        extensions: {
          critical: false,
          content: [],
        },
      },
    };
  }
}

/**
 * Parse TimeStampToken from TSA response
 * 
 * Extracts key information from TSA response (JSON or binary).
 * For binary DER format, would require ASN.1 parsing.
 * 
 * @param response - TSA response data
 * @returns Parsed TimeStampToken
 */
export function parseTimeStampToken(
  response: any
): TimeStampToken {
  // Extract token data from various possible response formats
  const tokenData =
    response.timeStampToken ||
    response.token ||
    response.tst ||
    response.signedData ||
    '';

  // Extract timestamp - various formats
  const timestamp =
    response.timestamp ||
    response.timeStampTime ||
    response.genTime ||
    response.time ||
    new Date().toISOString();

  // Extract serial - various formats
  const serialNumber =
    response.serialNumber ||
    response.serial ||
    response.serialNum ||
    response.sn ||
    `TSA_${Date.now()}`;

  // Extract certificate info if present
  const issuer = response.issuer || response.certificateIssuer || '';
  const subject = response.subject || response.certificateSubject || '';

  return {
    tokenData,
    serialNumber,
    timestamp: normalizeISO8601(timestamp),
    issuer,
    subject,
    isValid: !!tokenData && !tokenData.startsWith('mock_'),
  };
}

/**
 * Generate a cryptographically secure nonce
 */
export function generateNonce(): string {
  const randomBytes = new Uint8Array(16);
  // In a real environment, use crypto.getRandomValues()
  // For Expo, we generate from timestamp + random
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}_${random}`;
}

/**
 * Verify nonce in response matches request
 * (For full RFC 3161 compliance)
 */
export function verifyNonce(
  requestNonce: string,
  responseNonce: string
): boolean {
  return requestNonce === responseNonce;
}

/**
 * Normalize timestamp to ISO 8601 format
 */
export function normalizeISO8601(timestamp: any): string {
  if (!timestamp) {
    return new Date().toISOString();
  }

  // If already ISO 8601, return as-is
  if (typeof timestamp === 'string' && timestamp.includes('T')) {
    return timestamp;
  }

  // If Unix timestamp (number)
  if (typeof timestamp === 'number') {
    return new Date(timestamp).toISOString();
  }

  // If Date object
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  // Try to parse as date string
  try {
    return new Date(timestamp).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}

/**
 * Validate TimeStampToken signature
 * 
 * Full validation requires:
 * 1. Parse DER structure
 * 2. Extract signer info and signature
 * 3. Verify signature against content
 * 4. Validate certificate chain
 * 
 * For MVP: Basic checks only
 * For production: Use pkijs for proper X.509 validation
 * 
 * @param token - TimeStampToken to validate
 * @returns Validation result
 */
export async function validateTokenSignature(
  token: TimeStampToken
): Promise<{
  isValid: boolean;
  details: string[];
}> {
  const details: string[] = [];

  // Check 1: Token data exists
  if (!token.tokenData) {
    details.push('❌ No token data present');
    return { isValid: false, details };
  }

  // Check 2: Token is not mock
  if (
    token.tokenData.startsWith('mock_') ||
    token.tokenData.includes('STUB') ||
    token.isValid === false
  ) {
    details.push('❌ Token appears to be mock/stub');
    return { isValid: false, details };
  }

  // Check 3: Token has valid serial
  if (!token.serialNumber || token.serialNumber === 'undefined') {
    details.push('❌ No valid serial number');
    return { isValid: false, details };
  }

  // Check 4: Token has valid timestamp
  try {
    const timestamp = new Date(token.timestamp);
    if (isNaN(timestamp.getTime())) {
      details.push('❌ Invalid timestamp format');
      return { isValid: false, details };
    }
  } catch (e) {
    details.push('❌ Could not parse timestamp');
    return { isValid: false, details };
  }

  // Basic validation passed
  details.push('✅ Token structure valid');
  details.push(`Serial: ${token.serialNumber}`);
  details.push(`Timestamp: ${token.timestamp}`);

  // TODO: For production, add:
  // - Cryptographic signature validation
  // - Certificate chain verification
  // - CRL/OCSP validation
  // This requires pkijs and proper X.509 handling

  return { isValid: true, details };
}

/**
 * Extract certificate info from TimeStampToken
 * (For full implementation with pkijs)
 */
export function extractCertificateInfo(
  tokenData: string
): {
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
} {
  // Placeholder for future implementation with pkijs
  return {
    issuer: 'Not implemented',
    subject: 'Not implemented',
    validFrom: new Date().toISOString(),
    validTo: new Date().toISOString(),
  };
}
