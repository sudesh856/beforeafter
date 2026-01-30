/**
 * Blockchain Anchor Provider - REMOVED
 * 
 * Blockchain anchoring has been removed from this MVP.
 * 
 * Current implementation uses RFC 3161 TSA only.
 * See tsaClient.ts and anchorService.ts for real anchoring.
 * 
 * This file is kept for backwards compatibility only.
 * All functions throw "not implemented" errors.
 */

import { BlockchainAnchor, MerkleBatch } from './anchorTypes';

export interface BlockchainConfig {
  network: 'bitcoin' | 'ethereum' | 'polygon' | 'custom';
  rpcUrl: string;
  chainId?: number;
  account?: string;
  privateKey?: string;
}

/**
 * Blockchain anchoring is not implemented in this version.
 * Use RFC 3161 TSA instead (see anchorService.submitProofToTSA).
 */
export async function anchorToBlockchain(
  batch: MerkleBatch,
  config: BlockchainConfig
): Promise<BlockchainAnchor> {
  throw new Error(
    'Blockchain anchoring is not implemented. Use RFC 3161 TSA instead.'
  );
}

export async function checkBlockchainConfirmations(
  txHash: string,
  config: BlockchainConfig,
  minConfirmations: number = 6
): Promise<{
  blockNumber: number;
  confirmations: number;
  isConfirmed: boolean;
  timestamp: string;
}> {
  throw new Error('Blockchain verification not implemented');
}

export async function verifyBlockchainAnchor(
  anchor: BlockchainAnchor,
  config: BlockchainConfig
): Promise<{
  exists: boolean;
  confirmed: boolean;
  blockTimestamp: string;
  details: string;
}> {
  throw new Error('Blockchain verification not implemented');
}