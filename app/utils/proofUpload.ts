/**
 * Proof Upload and PIN Management
 * Handles worker flow: sign proof → upload → generate PIN
 */

import { API_ENDPOINTS, API_TIMEOUT_MS } from '@/app/config/api';
import { getWorkerPublicKey, ProofObject, signProof } from '@/app/utils/crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Register worker's public key with backend
 * Called once on first proof upload
 */
export const registerPublicKey = async (workerId: string): Promise<void> => {
  try {
    const publicKey = await getWorkerPublicKey();

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(
      API_ENDPOINTS.registerPublicKey(workerId),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to register public key: ${response.status}`);
    }

    // Mark as registered so we don't do it again
    await SecureStore.setItemAsync('publicKeyRegistered', 'true');
    console.log('✓ Public key registered with backend');
  } catch (error) {
    console.error('❌ Error registering public key:', error);
    throw error;
  }
};

/**
 * Upload proof with cryptographic signature
 * 
 * Flow:
 * 1. Check if first upload (register public key if needed)
 * 2. Sign proof with private key
 * 3. Send proof + signature to backend
 * 4. Backend verifies signature and stores
 */
export const uploadProof = async (proof: ProofObject): Promise<string> => {
  try {
    console.log('📤 Starting proof upload...');

    // Step 1: Register public key (always verify/register)
    console.log('🔑 Registering/verifying public key...');
    await registerPublicKey(proof.workerId);

    // Step 2: Sign the proof
    console.log('✍️ Signing proof...');
    const signature = await signProof(proof);

    // Step 3: Upload signed proof
    console.log('📝 Uploading signed proof to backend...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(API_ENDPOINTS.uploadProof, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof, signature }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✓ Proof uploaded successfully');

    return data.proofId || proof.proofId;
  } catch (error) {
    console.error('❌ Error uploading proof:', error);
    throw error;
  }
};

/**
 * Generate PIN for proof (worker side)
 * Backend generates 10-character alphanumeric PIN
 * Worker shares this with client
 */
export const generatePin = async (proofId: string): Promise<string> => {
  try {
    console.log('� Generating PIN for proof:', proofId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(
      API_ENDPOINTS.generatePin(proofId),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    console.log('📍 PIN response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PIN generation failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const pin = data.pin;

    if (!pin || pin.length !== 10) {
      throw new Error('Invalid PIN returned from backend');
    }

    console.log('✅ PIN GENERATED:', pin);
    return pin;
  } catch (error) {
    console.error('❌ Error generating PIN:', error);
    throw error;
  }
};

/**
 * Fetch backend proof data for client verification
 * Client enters PIN and retrieves: proof + signature + publicKey
 * All verification happens client-side
 */
export const fetchProofByPin = async (pin: string): Promise<{
  proof: ProofObject;
  signature: string;
  workerPublicKey: string;
}> => {
  try {
    console.log('🔍 Fetching proof with PIN:', pin);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(
      API_ENDPOINTS.verifyPin(pin.trim()),
      {
        method: 'GET',
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    // Handle specific error codes
    if (response.status === 404) {
      throw new Error('Invalid or expired code');
    }
    if (response.status === 410) {
      throw new Error('Code has expired');
    }
    if (!response.ok) {
      throw new Error(`Verification failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.proof || !data.signature || !data.workerPublicKey) {
      throw new Error('Invalid response from backend');
    }

    console.log('✓ Proof data retrieved');
    return data;
  } catch (error) {
    console.error('❌ Error fetching proof:', error);
    throw error;
  }
};
