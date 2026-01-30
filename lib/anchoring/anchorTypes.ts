/**
 * External Timestamp Anchoring Type Definitions
 * 
 * This module defines the data structures for externally anchoring proofs
 * to blockchain or RFC 3161 timestamp authorities. These are ADDITIVE only—
 * no existing proof structures are modified.
 */

/**
 * Merkle proof component: a single node in the path from hash → root
 */
export type MerkleProofNode = {
  hash: string;      // Node hash value
  position: 'left' | 'right';  // Position relative to parent
};

/**
 * Blockchain anchor metadata
 * Stores the result of anchoring a Merkle root to a blockchain
 */
export type BlockchainAnchor = {
  type: 'blockchain';
  
  // Merkle tree structure
  rootHash: string;
  merkleProof: MerkleProofNode[];  // Path from this proofHash to root
  
  // Blockchain transaction details
  txHash: string;        // Transaction hash
  blockNumber: number;   // Block number where root was recorded
  blockTimestamp: string; // ISO timestamp of block (UTC)
  
  // Blockchain network identifier
  network: 'bitcoin' | 'ethereum' | 'polygon' | 'custom';
  chainId?: number;     // For EVM chains
  
  // Anchor submission metadata
  anchoredAt: string;   // ISO timestamp when anchoring was requested (UTC)
  anchorProvider?: string; // E.g., "bitcoin-blockchain", "polygon-mainnet"
  
  // Confirmation status
  confirmations: number; // Number of blocks after anchor block
  isConfirmed: boolean;  // True if min confirmations reached
};

/**
 * RFC 3161 Timestamp Authority anchor metadata
 * REAL IMPLEMENTATION: Results from ACTUAL TSA server (DigiCert, Sectigo, etc.)
 * 
 * CRITICAL: tokenData MUST contain actual third-party-signed token
 * - NOT mock data, NOT placeholder
 * - Must be base64-encoded .tsr file from real TSA
 * - If tokenData starts with 'mock_' or contains 'STUB', it's INVALID
 * - If network is down, submission must FAIL (not return fake data)
 */
export type TSAAnchor = {
  type: 'tsa';
  
  // Hash that was submitted to TSA
  hashedValue: string;   // SHA256(proofHash) - what TSA actually signed
  
  // TSA server details (MUST be real, public service)
  tsaUrl: string;        // RFC 3161 TSA endpoint URL (e.g., http://timestamp.digicert.com)
  tsaName: string;       // Human-readable TSA identifier (e.g., 'DigiCert', 'Sectigo')
  
  // Timestamp token from TSA (the cryptographic proof)
  tokenData: string;     // Base64-encoded RFC 3161 TimeStampToken (.tsr file bytes)
                         // This is the REAL TOKEN from the TSA server
                         // Must NOT be 'mock_*' or contain 'STUB'
  tokenVersion: string;  // Token format version ('1.0' for RFC 3161-2001)
  
  // Extracted from real token
  authenticatedTime: string;  // ISO timestamp from TSA (UTC, authoritative time)
  serialNumber: string;       // Unique serial number from TSA token
  
  // Anchor metadata
  anchoredAt: string;    // ISO timestamp when we received the token (UTC)
  
  // Status tracking
  isValid: boolean;      // True if token came from real TSA (signature would be verified in production)
};

/**
 * Union type: either blockchain or TSA anchor
 */
export type ExternalAnchor = {
  status: 'anchored' | 'pending' | 'failed' | 'unanchored';
  anchoredAt?: string;                    // ISO timestamp from external source
  method?: 'tsa' | 'blockchain' | 'mock'; // Which was used
  proof?: string;                         // Signed token or tx hash
  verification?: 'valid' | 'invalid' | 'pending' | 'failed';
  error_reason?: string;                  // Error message if status === 'failed'
  
  // TSA-specific fields (when method === 'tsa' or 'mock')
  tsaUrl?: string;
  tsaName?: string;
  tokenData?: string;                    // Base64-encoded RFC 3161 TimeStampToken
  authenticatedTime?: string;            // ISO timestamp from TSA
  serialNumber?: string;                 // TSA token serial
  hashedValue?: string;
  isValid?: boolean;
};

/**
 * Complete anchor status for a single proof
 */
export type AnchorStatus = {
  proofHash: string;
  
  // Anchor state machine
  status: 'queued' | 'pending' | 'confirmed' | 'failed' | 'unanchored';
  
  // The actual anchor (if successful)
  anchor?: ExternalAnchor;
  
  // Error tracking
  error?: string;
  lastRetryAt?: string;
  retryCount: number;
  maxRetries: number;
  
  // Metadata
  createdAt: string;     // When proof was created
  queuedAt: string;      // When anchoring was queued
  anchoredAt?: string;   // When anchor was recorded
};

/**
 * Anchor queue item: a proof waiting to be anchored
 */
export type AnchorQueueItem = {
  proofHash: string;
  appVersion?: string;
  createdAt?: string;    // Proof creation time (local)
  enqueuedAt: string;    // When added to queue (UTC)
  priority: 'normal' | 'high';  // For batching decisions
};

/**
 * Merkle batch: multiple proofs batched together
 */
export type MerkleBatch = {
  id: string;            // Batch identifier
  proofHashes: string[]; // Hashes in this batch
  rootHash: string;      // Root of Merkle tree
  treeDepth: number;     // Height of tree
  leafCount: number;     // Number of leaves
  
  createdAt: string;     // When batch was assembled (UTC)
  batchedAt: string;     // When sent for anchoring (UTC)
  
  // If anchored
  anchor?: ExternalAnchor;
  anchoredAt?: string;
};

/**
 * Local storage schema for anchor data
 * Stored separately from proofs for flexibility
 */
export type AnchorStore = {
  // Key: proofHash, Value: AnchorStatus
  anchors: Record<string, AnchorStatus>;
  
  // Queue of proofs waiting to be anchored
  queue: AnchorQueueItem[];
  
  // Recent batches (for reference)
  batches: MerkleBatch[];
  
  // Anchor service configuration
  config: {
    batchSize: number;          // Max proofs per batch
    batchTimeoutMs: number;     // Max wait time before forcing batch
    enableBlockchainAnchor: boolean;
    enableTSAAnchor: boolean;
    tsaUrl?: string;
    maxRetries: number;
    retryDelayMs: number;
  };
  
  // Metrics
  lastSyncAt?: string;
  totalAnchored: number;
  totalFailed: number;
};

/**
 * Verification result when checking an anchor
 */
export type AnchorVerificationResult = {
  isValid: boolean;
  timestamp?: string;    // When anchor was created
  confidence: 'high' | 'medium' | 'low' | 'unanchored';
  
  // Detailed results
  merkleProofValid?: boolean;
  rootInBlockchain?: boolean;
  blockTimestampValid?: boolean;
  tsaSignatureValid?: boolean;
  
  // Messages for user/court
  humanSummary: string;
  details: string[];
};

/**
 * Configuration for anchor service
 */
export type AnchorServiceConfig = {
  // Batching
  batchSize: number;           // Number of proofs per batch (default: 10)
  batchTimeoutMs: number;      // Max time before forced batch (default: 5min)
  
  // Blockchain (if enabled)
  blockchainEnabled: boolean;
  blockchainProvider?: 'bitcoin' | 'ethereum' | 'polygon' | 'custom';
  blockchainRpcUrl?: string;
  blockchainAccount?: string;  // For cost/attribution
  
  // RFC 3161 TSA (if enabled)
  tsaEnabled: boolean;
  tsaUrl?: string;             // RFC 3161 server endpoint
  tsaTimeout?: number;         // Request timeout (default: 30s)
  
  // Retry policy
  maxRetries: number;          // Max retry attempts (default: 3)
  retryDelayMs: number;        // Base delay between retries (default: 1000)
  retryBackoffMultiplier: number; // Exponential backoff factor (default: 2)
  
  // Verification
  minBlockConfirmations: number; // Require N blocks after anchor (default: 6)
  
  // Storage
  storageKey: string;          // AsyncStorage key for anchor data
};
