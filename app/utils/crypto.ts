
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { sha256 } from 'js-sha256';
import { Platform } from 'react-native';
import 'react-native-get-random-values';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

/**
 * Convert hex string to Uint8Array
 * React Native doesn't support Buffer, so we use Uint8Array instead
 */
const hexToUint8Array = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
};

/**
 * Proof object structure
 */
export interface ProofObject {
  proofId: string;
  status: string;
  workerId: string;
  proofHash?: string;  // Add for hash verification
  createdAt: string;
  before: {
    timestamp: string;
    imageHash: string;
    gps: {
      lat: number;
      lon: number;
      accuracy?: number;
    };
  };
  after: {
    timestamp: string;
    imageHash: string;
    gps: {
      lat: number;
      lon: number;
      accuracy?: number;
    };
  };
  // Optional fields needed for proofHash computation
  device?: string;
  platform?: string;
  timeWindow?: {
    minTimeMs: number;
    maxTimeMs: number;
    actualElapsedMs: number;
    timeSource: string;
  };
  [key: string]: any;
}

/**
 * Get device-specific worker ID
 * Ensures each device has unique identity for signature verification
 */
export const getDeviceWorkerId = async (): Promise<string> => {
  try {
    // Use device-specific ID
    let deviceId = '';

    if (Platform.OS === 'android') {
      deviceId = Application.getAndroidId();
    } else if (Platform.OS === 'ios') {
      deviceId = await Application.getIosIdForVendorAsync() || '';
    }

    // Fallback to random ID if device ID unavailable
    if (!deviceId) {
      let stored = await SecureStore.getItemAsync('deviceWorkerId');
      if (!stored) {
        stored = 'WORKER_' + Math.random().toString(36).substring(2, 15);
        await SecureStore.setItemAsync('deviceWorkerId', stored);
      }
      deviceId = stored;
    }

    return 'WORKER_' + deviceId;
  } catch (error) {
    console.error('Failed to get device worker ID:', error);
    return 'WORKER_LOCAL'; // Fallback
  }
};

/**
 * Generate Ed25519 keypair for worker
 * Called once on first app launch in worker mode
 * Stores keys securely in Expo Secure Store
 */
export const generateWorkerKeypair = async (): Promise<void> => {
  try {
    const existing = await SecureStore.getItemAsync('workerPrivateKey');
    if (existing) {
      console.log('✓ Worker keypair already exists');
      return;
    }

    console.log('🔐 Generating worker Ed25519 keypair...');
    const keypair = nacl.sign.keyPair();

    // Store private key securely
    await SecureStore.setItemAsync(
      'workerPrivateKey',
      encodeBase64(keypair.secretKey)
    );

    // Store public key (non-sensitive, but keep secure anyway)
    await SecureStore.setItemAsync(
      'workerPublicKey',
      encodeBase64(keypair.publicKey)
    );

    console.log('✓ Worker keypair generated and stored securely');
  } catch (error) {
    console.error('❌ Error generating keypair:', error);
    throw error;
  }
};

/**
 * Canonicalize proof to deterministic JSON string
 * CRITICAL: Must be identical on worker and client for signature verification
 * 
 * Steps:
 * 1. Extract only essential fields
 * 2. Maintain strict field order (alphabetical)
 * 3. No extra whitespace
 * 4. Deterministic nested object ordering
 */
export const canonicalizeProof = (proof: any): string => {
  // Force EXACT precision for GPS coordinates (7 decimal places)
  const afterLat = proof.after?.gps?.lat ? Number(Number(proof.after.gps.lat).toFixed(7)) : 0;
  const afterLon = proof.after?.gps?.lon ? Number(Number(proof.after.gps.lon).toFixed(7)) : 0;
  const beforeLat = proof.before?.gps?.lat ? Number(Number(proof.before.gps.lat).toFixed(7)) : 0;
  const beforeLon = proof.before?.gps?.lon ? Number(Number(proof.before.gps.lon).toFixed(7)) : 0;

  /* 
   * Force strings for hashes and timestamps
   * Added .trim() to remove accidental whitespace which causes verification failures
   */
  const afterHash = String(proof.after?.imageHash || '').trim();

  // Normalize timestamps to remove trailing zeros from milliseconds
  const normalizeTimestamp = (ts: string): string => {
    if (!ts) return '';
    let normalized = ts.trim();
    // 1. Remove trailing zeros from fractional seconds: "2026...21.520Z" → "2026...21.52Z"
    normalized = normalized.replace(/(\.\d*?)0+Z$/, '$1Z');
    // 2. If that left a trailing dot (because all ms were 0), remove it: "2026...00.Z" → "2026...00Z"
    normalized = normalized.replace(/\.Z$/, 'Z');
    return normalized;
  };

  const afterTime = normalizeTimestamp(String(proof.after?.timestamp || ''));
  const beforeHash = String(proof.before?.imageHash || '').trim();
  const beforeTime = normalizeTimestamp(String(proof.before?.timestamp || ''));
  const createdAt = normalizeTimestamp(String(proof.createdAt || ''));
  const proofId = String(proof.proofId || '').trim();
  const status = String(proof.status || '').trim();
  const workerId = String(proof.workerId || '').trim();

  // Build canonical string manually (NO JSON.stringify variations)
  const canonical =
    '{"after":{"gps":{"lat":' + afterLat + ',"lon":' + afterLon + '},' +
    '"imageHash":"' + afterHash + '",' +
    '"timestamp":"' + afterTime + '"},' +
    '"before":{"gps":{"lat":' + beforeLat + ',"lon":' + beforeLon + '},' +
    '"imageHash":"' + beforeHash + '",' +
    '"timestamp":"' + beforeTime + '"},' +
    '"createdAt":"' + createdAt + '",' +
    '"proofId":"' + proofId + '",' +
    '"status":"' + status + '",' +
    '"workerId":"' + workerId + '"}';

  // Debug logs removed per user request
  // console.log('🔍 Canonical String:', canonical);
  // console.log('#️⃣ Canonical Hash:', sha256(canonical));

  return canonical;
};


export const signProof = async (proof: ProofObject): Promise<string> => {
  try {
    // console.log('✍️ Signing proof...');
    // Compute proofHash the SAME WAY the client does (from createProofHash in index.tsx/[id].tsx)
    // MUST match client computation exactly: beforeHash, afterHash, timestamp, locations, device, platform, timeWindow
    const proofHashInput = JSON.stringify({
      beforeHash: proof.before?.imageHash || '',
      afterHash: proof.after?.imageHash || '',
      timestamp: proof.before?.timestamp || '',
      beforeLocation: {
        latitude: proof.before?.gps?.lat || 0,
        longitude: proof.before?.gps?.lon || 0,
        accuracy: (proof.before?.gps as any)?.accuracy || 0
      },
      afterLocation: {
        latitude: proof.after?.gps?.lat || 0,
        longitude: proof.after?.gps?.lon || 0,
        accuracy: (proof.after?.gps as any)?.accuracy || 0
      },
      device: proof.device || '',
      platform: proof.platform || '',
      timeWindow: proof.timeWindow ? {
        minTimeMs: proof.timeWindow.minTimeMs,
        maxTimeMs: proof.timeWindow.maxTimeMs,
        actualElapsedMs: proof.timeWindow.actualElapsedMs,
        timeSource: proof.timeWindow.timeSource,
      } : null,
    });

    const proofHash = sha256(proofHashInput);

    const privateKeyB64 = await SecureStore.getItemAsync('workerPrivateKey');
    if (!privateKeyB64) {
      throw new Error('Worker private key not found. Generate keypair first.');
    }

    const privateKey = decodeBase64(privateKeyB64);

    const signatureBytes = nacl.sign.detached(
      hexToUint8Array(proofHash),
      privateKey
    );

    const signatureB64 = encodeBase64(signatureBytes);
    // console.log('✓ Proof signed successfully');
    return signatureB64;
  } catch (error) {
    console.error('❌ Error signing proof:', error);
    throw error;
  }
};

/**
 * Verify proof signature (CLIENT-SIDE ONLY)
 * This is the critical security operation that ensures proof integrity
 * 
 * Process:
 * 1. Compute proofHash the SAME WAY signProof does
 * 2. Verify signature against proof hash using worker's public key
 * 3. Return boolean verification result
 */
export const verifyProofSignature = async (
  proof: ProofObject,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> => {
  try {
    // console.log('🔒 Verifying signature client-side...');
    // Compute proofHash the SAME WAY signProof does for consistency
    const proofHashInput = JSON.stringify({
      beforeHash: proof.before?.imageHash || '',
      afterHash: proof.after?.imageHash || '',
      timestamp: proof.before?.timestamp || '',
      beforeLocation: {
        latitude: proof.before?.gps?.lat || 0,
        longitude: proof.before?.gps?.lon || 0,
        accuracy: (proof.before?.gps as any)?.accuracy || 0
      },
      afterLocation: {
        latitude: proof.after?.gps?.lat || 0,
        longitude: proof.after?.gps?.lon || 0,
        accuracy: (proof.after?.gps as any)?.accuracy || 0
      },
      device: proof.device || '',
      platform: proof.platform || '',
      timeWindow: proof.timeWindow ? {
        minTimeMs: proof.timeWindow.minTimeMs,
        maxTimeMs: proof.timeWindow.maxTimeMs,
        actualElapsedMs: proof.timeWindow.actualElapsedMs,
        timeSource: proof.timeWindow.timeSource,
      } : null,
    });

    const proofHash = sha256(proofHashInput);

    const signature = decodeBase64(signatureBase64);
    const publicKey = decodeBase64(publicKeyBase64);

    const isValid = nacl.sign.detached.verify(
      hexToUint8Array(proofHash),
      signature,
      publicKey
    );

    if (isValid) {
      // console.log('✅ Signature verification PASSED');
    } else {
      console.log('❌ Signature verification FAILED');
    }

    return isValid;
  } catch (error) {
    console.error('❌ Error verifying signature:', error);
    return false;
  }
};


export const getWorkerPublicKey = async (): Promise<string> => {
  try {
    const publicKey = await SecureStore.getItemAsync('workerPublicKey');
    if (!publicKey) {
      throw new Error('Worker public key not found');
    }
    return publicKey;
  } catch (error) {
    console.error('❌ Error getting public key:', error);
    throw error;
  }
};

/**
 * Get the unique Key ID for the current worker keypair
 * Key ID = SHA-256(Base64 Public Key)
 */
export const getKeyId = async (): Promise<string> => {
  try {
    const publicKey = await getWorkerPublicKey();
    return sha256(publicKey);
  } catch (error) {
    console.error('❌ Error getting key ID:', error);
    throw error;
  }
};

/**
 * Validate proof structure before signing/displaying
 * Ensures all required fields exist
 */
export const validateProof = (proof: any): boolean => {
  try {
    if (!proof || typeof proof !== 'object') return false;
    if (!proof.proofId || !proof.status || !proof.workerId) return false;
    if (!proof.createdAt) return false;

    // Validate before/after structure
    if (!proof.before || !proof.before.gps || typeof proof.before.gps.lat !== 'number') {
      return false;
    }
    if (typeof proof.before.gps.lon !== 'number') return false;
    if (!proof.before.imageHash || !proof.before.timestamp) return false;

    if (!proof.after || !proof.after.gps || typeof proof.after.gps.lat !== 'number') {
      return false;
    }
    if (typeof proof.after.gps.lon !== 'number') return false;
    if (!proof.after.imageHash || !proof.after.timestamp) return false;

    return true;
  } catch (error) {
    console.error('❌ Error validating proof:', error);
    return false;
  }
};

/**
 * Clear worker keys from secure storage (for cleanup/logout)
 */
export const clearWorkerKeys = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync('workerPrivateKey');
    await SecureStore.deleteItemAsync('workerPublicKey');
    await SecureStore.deleteItemAsync('publicKeyRegistered');
    console.log('✓ Worker keys cleared');
  } catch (error) {
    console.error('❌ Error clearing keys:', error);
  }
};
