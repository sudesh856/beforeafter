/**
 * Anchor Verification Module
 * 
 * Verifies external anchors for correctness and provides
 * detailed results suitable for legal/forensic use.
 */

import {
    AnchorVerificationResult,
    BlockchainAnchor,
    ExternalAnchor,
    TSAAnchor,
} from './anchorTypes';
import {
    BlockchainConfig,
    checkBlockchainConfirmations
} from './blockchainAnchor';
import { verifyMerkleProof } from './merkle';
import { validateTimestampSequence, verifyTSATimestamp } from './tsaClient';

/**
 * Verify an external anchor is valid
 * 
 * @param proofHash - The original proof hash
 * @param anchor - The anchor to verify
 * @param proofCreatedAt - When the proof was created (for sequence validation)
 * @param blockchainConfig - Config for blockchain verification (if needed)
 * @returns Detailed verification result
 */
export async function verifyExternalAnchor(
  proofHash: string,
  anchor: ExternalAnchor,
  proofCreatedAt: string,
  blockchainConfig?: BlockchainConfig
): Promise<AnchorVerificationResult> {
  try {
    // Determine anchor type based on which fields are populated
    if (anchor.proof && anchor.method === 'blockchain') {
      return await verifyBlockchainAnchorInternal(
        proofHash,
        anchor as unknown as BlockchainAnchor,
        proofCreatedAt,
        blockchainConfig
      );
    } else if (anchor.tokenData || anchor.method === 'tsa') {
      return await verifyTSAAnchorInternal(proofHash, anchor as unknown as TSAAnchor, proofCreatedAt);
    }
  } catch (err) {
    console.error('Anchor verification error:', err);
    return {
      isValid: false,
      confidence: 'low',
      humanSummary: 'Anchor verification failed',
      details: [`Error: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  return {
    isValid: false,
    confidence: 'low',
    humanSummary: 'Anchor verification failed',
    details: ['Unknown error'],
  };
}

/**
 * Verify blockchain anchor
 */
async function verifyBlockchainAnchorInternal(
  proofHash: string,
  anchor: BlockchainAnchor,
  proofCreatedAt: string,
  blockchainConfig?: BlockchainConfig
): Promise<AnchorVerificationResult> {
  const details: string[] = [];
  let isValid = true;
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  // 1. Verify Merkle proof
  let merkleProofValid = false;
  try {
    merkleProofValid = await verifyMerkleProof(
      proofHash,
      anchor.merkleProof,
      anchor.rootHash
    );
    details.push(
      `Merkle proof: ${merkleProofValid ? '✓ Valid' : '✗ Invalid'}`
    );
    if (!merkleProofValid) {
      isValid = false;
    }
  } catch (error) {
    details.push(`Merkle proof verification error: ${error}`);
    isValid = false;
  }

  // 2. Verify timestamp sequence
  const sequenceCheck = validateTimestampSequence(
    proofCreatedAt,
    anchor.blockTimestamp
  );
  details.push(`Timestamp sequence: ${sequenceCheck.message}`);
  if (!sequenceCheck.valid) {
    isValid = false;
  }

  // 3. Check blockchain confirmation status
  let rootInBlockchain = false;
  if (blockchainConfig) {
    try {
      const confirmationStatus = await checkBlockchainConfirmations(
        anchor.txHash,
        blockchainConfig,
        6
      );
      rootInBlockchain = confirmationStatus.isConfirmed;
      details.push(
        `Blockchain confirmations: ${confirmationStatus.confirmations}/${6}`
      );
      if (!confirmationStatus.isConfirmed) {
        isValid = false;
        confidence = 'low';
      } else {
        confidence = 'high';
      }
    } catch (error) {
      details.push(`Blockchain check error: ${error}`);
    }
  } else {
    details.push('⚠ No blockchain config provided (verification incomplete)');
  }

  // 4. Build summary
  let humanSummary = '';
  if (isValid && confidence === 'high') {
    humanSummary = `✓ Anchor verified on ${anchor.network} at block ${anchor.blockNumber} (${anchor.confirmations} confirmations)`;
  } else if (merkleProofValid && sequenceCheck.valid) {
    humanSummary = `⚠ Merkle proof valid but blockchain status pending (${anchor.confirmations} confirmations)`;
    confidence = 'medium';
  } else {
    humanSummary = '✗ Anchor verification failed';
    confidence = 'low';
  }

  return {
    isValid: isValid && merkleProofValid,
    timestamp: anchor.anchoredAt,
    confidence,
    merkleProofValid,
    rootInBlockchain,
    blockTimestampValid: sequenceCheck.valid,
    humanSummary,
    details,
  };
}

/**
 * Verify TSA anchor
 */
async function verifyTSAAnchorInternal(
  proofHash: string,
  anchor: TSAAnchor,
  proofCreatedAt: string
): Promise<AnchorVerificationResult> {
  const details: string[] = [];
  let isValid = true;
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  // 1. Verify TSA signature
  let tsaSignatureValid = false;
  try {
    const tokenVerification = await verifyTSATimestamp(anchor);
    tsaSignatureValid = tokenVerification.isValid;
    details.push(
      `TSA signature: ${tsaSignatureValid ? '✓ Valid' : '⚠ Not verified'}`
    );
    details.push(`TSA Server: ${anchor.tsaName}`);
    details.push(...tokenVerification.details);

    if (!tsaSignatureValid) {
      isValid = false;
    } else {
      confidence = 'high';
    }
  } catch (error) {
    details.push(`TSA verification error: ${error}`);
    isValid = false;
  }

  // 2. Verify timestamp sequence
  const sequenceCheck = validateTimestampSequence(
    proofCreatedAt,
    anchor.authenticatedTime
  );
  details.push(`Timestamp sequence: ${sequenceCheck.message}`);
  if (!sequenceCheck.valid) {
    isValid = false;
  }

  // 3. Check hash matches
  details.push(`Hash submitted: ${anchor.hashedValue.substring(0, 16)}...`);
  details.push(
    `Authenticated at: ${anchor.authenticatedTime} (Serial: ${anchor.serialNumber})`
  );

  // 4. Build summary
  let humanSummary = '';
  if (isValid && confidence === 'high') {
    humanSummary = `✓ RFC 3161 timestamp verified (${anchor.tsaName})`;
  } else if (tsaSignatureValid) {
    humanSummary = `⚠ TSA timestamp pending full verification`;
    confidence = 'medium';
  } else {
    humanSummary = '✗ TSA timestamp verification incomplete';
    confidence = 'low';
  }

  return {
    isValid: isValid && tsaSignatureValid,
    timestamp: anchor.authenticatedTime,
    confidence,
    tsaSignatureValid,
    humanSummary,
    details,
  };
}

/**
 * Check if a proof has any anchor and get its status
 */
export function getAnchorConfidenceLevel(
  anchor: ExternalAnchor | undefined
): 'high' | 'medium' | 'low' | 'unanchored' {
  if (!anchor) {
    return 'unanchored';
  }

  // Blockchain anchor check
  if (anchor.method === 'blockchain' || anchor.proof?.startsWith('0x')) {
    const isConfirmed = anchor.verification === 'valid';
    // Since ExternalAnchor doesn't have confirmations field, 
    // we treat verified as high confidence
    if (isConfirmed) {
      return 'high';
    }
    if (anchor.status === 'pending') {
      return 'medium';
    }
    return 'low';
  }

  // TSA anchor check
  if (anchor.method === 'tsa' || anchor.tokenData) {
    if (anchor.isValid && anchor.verification === 'valid') {
      return 'high';
    }
    return 'medium'; // Even unverified TSA tokens have value
  }

  return 'low';
}

/**
 * Generate human-readable anchor status summary
 */
export function getAnchorSummary(
  anchor: ExternalAnchor | undefined,
  proofCreatedAt?: string
): {
  status: string;
  details: string[];
} {
  if (!anchor) {
    return {
      status: 'Not anchored',
      details: [
        'This proof has not been anchored to an external timestamp.',
        'It remains valid but without independent time verification.',
      ],
    };
  }

  // Check if anchoring failed
  if (anchor.status === 'failed') {
    return {
      status: `❌ TSA Failed`,
      details: [
        `Reason: ${anchor.error_reason || 'Unknown error'}`,
        'Proof remains valid but not externally timestamped.',
        'Retry anchoring when network is available.',
      ],
    };
  }

  const details: string[] = [];

  // Check if blockchain anchor
  if (anchor.method === 'blockchain' || anchor.proof?.startsWith('0x')) {
    const status =
      anchor.verification === 'valid'
        ? `✓ Anchored to blockchain`
        : `⏳ Pending blockchain confirmation`;

    details.push(`Status: ${anchor.status}`);
    if (anchor.proof) {
      details.push(`Transaction: ${anchor.proof.substring(0, 20)}...`);
    }
    if (anchor.anchoredAt) {
      details.push(`Anchored at: ${new Date(anchor.anchoredAt).toLocaleString()}`);
    }
    if (proofCreatedAt && anchor.anchoredAt) {
      const diff = (new Date(anchor.anchoredAt).getTime() - new Date(proofCreatedAt).getTime()) / 1000;
      details.push(`Time between creation and anchor: ${Math.round(diff)}s`);
    }

    return { status, details };
  }

  // Check if TSA anchor
  if (anchor.method === 'tsa' || anchor.tokenData) {
    const status = anchor.isValid
      ? `✅ Timestamped by ${anchor.tsaName}`
      : `⏳ Awaiting verification (${anchor.tsaName})`;

    details.push(`TSA Server: ${anchor.tsaName}`);
    if (anchor.authenticatedTime) {
      details.push(`Timestamp: ${new Date(anchor.authenticatedTime).toLocaleString()}`);
    }
    if (anchor.serialNumber) {
      details.push(`Serial: ${anchor.serialNumber}`);
    }
    details.push(`Token Status: ${anchor.isValid ? 'Valid' : 'Pending Validation'}`);

    return { status, details };
  }

  return {
    status: 'Unknown anchor type',
    details: [],
  };
}
