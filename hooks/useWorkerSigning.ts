/**
 * Hook: useWorkerSigning
 * 
 * Manages worker cryptographic signing operations
 * - Generate keypair on first use
 * - Upload signed proofs
 * - Generate PINs for sharing
 */

import {
    generateWorkerKeypair,
    ProofObject,
} from '@/app/utils/crypto';
import { generatePin, uploadProof } from '@/app/utils/proofUpload';
import { useEffect, useState } from 'react';

export interface WorkerSigningState {
  isInitialized: boolean;
  error: string | null;
  isUploading: boolean;
  isGeneratingPin: boolean;
}

export const useWorkerSigning = () => {
  const [state, setState] = useState<WorkerSigningState>({
    isInitialized: false,
    error: null,
    isUploading: false,
    isGeneratingPin: false,
  });

  /**
   * Initialize worker signing on component mount
   * Generates keypair if it doesn't exist
   */
  useEffect(() => {
    const initializeSigning = async () => {
      try {
        console.log('🔐 Initializing worker signing...');
        await generateWorkerKeypair();
        setState(prev => ({
          ...prev,
          isInitialized: true,
          error: null,
        }));
      } catch (error) {
        console.error('❌ Error initializing signing:', error);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Initialization failed',
        }));
      }
    };

    initializeSigning();
  }, []);

  /**
   * Upload a proof with cryptographic signature
   */
  const uploadSignedProof = async (proof: ProofObject): Promise<string> => {
    setState(prev => ({ ...prev, isUploading: true, error: null }));
    try {
      const proofId = await uploadProof(proof);
      setState(prev => ({ ...prev, isUploading: false }));
      return proofId;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      setState(prev => ({
        ...prev,
        isUploading: false,
        error: errorMsg,
      }));
      throw error;
    }
  };

  /**
   * Generate a PIN for sharing proof with client
   */
  const generateSharingPin = async (proofId: string): Promise<string> => {
    setState(prev => ({ ...prev, isGeneratingPin: true, error: null }));
    try {
      const pin = await generatePin(proofId);
      setState(prev => ({ ...prev, isGeneratingPin: false }));
      return pin;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'PIN generation failed';
      setState(prev => ({
        ...prev,
        isGeneratingPin: false,
        error: errorMsg,
      }));
      throw error;
    }
  };

  return {
    ...state,
    uploadSignedProof,
    generateSharingPin,
  };
};
