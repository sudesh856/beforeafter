
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
  createdAt: string;
  before: {
    timestamp: string;
    imageHash: string;
    gps: {
      lat: number;
      lon: number;
    };
  };
  after: {
    timestamp: string;
    imageHash: string;
    gps: {
      lat: number;
      lon: number;
    };
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

  // Force strings for hashes and timestamps
  const afterHash = String(proof.after?.imageHash || '');
  // Normalize timestamps to remove trailing zeros from milliseconds
  const normalizeTimestamp = (ts: string): string => {
    if (!ts) return '';
    // Remove trailing zeros: "2026-02-15T07:00:21.520Z" → "2026-02-15T07:00:21.52Z"
    return ts.replace(/(\.\d*?)0+Z$/, '$1Z');
  };

  const afterTime = normalizeTimestamp(String(proof.after?.timestamp || ''));
  const beforeHash = String(proof.before?.imageHash || '');
  const beforeTime = normalizeTimestamp(String(proof.before?.timestamp || ''));
  const createdAt = normalizeTimestamp(String(proof.createdAt || ''));
  const proofId = String(proof.proofId || '');
  const status = String(proof.status || '');
  const workerId = String(proof.workerId || '');

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



  return canonical;
};


export const signProof = async (proof: ProofObject): Promise<string> => {
  try {
    console.log('✍️ Signing proof...');
    const canonicalJSON = canonicalizeProof(proof);

    const proofHash = sha256(canonicalJSON);

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
    console.log('✓ Proof signed successfully');
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
 * 1. Canonicalize the proof the same way worker did
 * 2. Hash with SHA256
 * 3. Verify signature against proof hash using worker's public key
 * 4. Return boolean verification result
 */
export const verifyProofSignature = async (
  proof: ProofObject,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> => {
  try {
    console.log('� Verifying signature client-side...');
    const canonicalJSON = canonicalizeProof(proof);

    const proofHash = sha256(canonicalJSON);

    const signature = decodeBase64(signatureBase64);
    const publicKey = decodeBase64(publicKeyBase64);

    const isValid = nacl.sign.detached.verify(
      hexToUint8Array(proofHash),
      signature,
      publicKey
    );

    if (isValid) {
      console.log('✅ Signature verification PASSED');
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
