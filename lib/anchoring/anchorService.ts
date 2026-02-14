/**
 * Anchor Service - Real RFC 3161 TSA
 * 
 * Submits to real RFC 3161 TSA endpoints (FreeTSA by default).
 * Returns cryptographically signed timestamps with unique serial numbers.
 * 
 * When a proof is created:
 * 1. App submits proofHash to FreeTSA
 * 2. TSA returns anchored status with token/metadata
 * 3. JSON includes anchor data with status and verification
 * 4. UI shows anchor status
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AnchorServiceConfig,
  AnchorStatus,
  AnchorStore,
  ExternalAnchor,
  TSAAnchor
} from './anchorTypes';
import {
  FREETSA,
  TSAConfig,
  submitToRealTSA,
  verifyTSATimestamp
} from './tsaClient';

const DEFAULT_CONFIG: AnchorServiceConfig = {
  batchSize: 10,
  batchTimeoutMs: 5 * 60 * 1000,
  blockchainEnabled: false,
  tsaEnabled: true,
  maxRetries: 2,
  retryDelayMs: 2000,
  retryBackoffMultiplier: 2,
  minBlockConfirmations: 6,
  storageKey: 'anchor_store',
  tsaUrl: 'https://freetsa.org/tsr',
};

/**
 * Main anchor service singleton
 * Submits to real RFC 3161 TSA (FreeTSA by default)
 */
export class AnchorService {
  private static instance: AnchorService;
  private config: AnchorServiceConfig;
  private store: AnchorStore | null = null;
  private realTSAConfig: TSAConfig = FREETSA;

  private constructor(config: Partial<AnchorServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(config?: Partial<AnchorServiceConfig>): AnchorService {
    if (!AnchorService.instance) {
      AnchorService.instance = new AnchorService(config);
    }
    return AnchorService.instance;
  }

  /**
   * Initialize service and load from storage
   */
  async initialize(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.config.storageKey);
      if (stored) {
        this.store = JSON.parse(stored);
      } else {
        this.store = {
          anchors: {},
          queue: [],
          batches: [],
          config: {
            batchSize: this.config.batchSize,
            batchTimeoutMs: this.config.batchTimeoutMs,
            enableBlockchainAnchor: false,         // Blockchain removed
            enableTSAAnchor: this.config.tsaEnabled,
            tsaUrl: this.config.tsaUrl,
            maxRetries: this.config.maxRetries,
            retryDelayMs: this.config.retryDelayMs,
          },
          totalAnchored: 0,
          totalFailed: 0,
        };
        await this.save();
      }
    } catch (error) {
      console.error('[Anchor] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Queue a proof for anchoring (legacy, use submitProofToTSA instead)
   * 
   * DEPRECATED: Use submitProofToTSA() for real anchoring
   * This method is kept for compatibility but doesn't do anything useful
   */
  async queueProof(proofHash: string): Promise<AnchorStatus> {
    // Real implementation submits immediately via submitProofToTSA()
    // Don't use this method
    console.warn('[Anchor] queueProof is deprecated. Use submitProofToTSA() instead.');

    return {
      proofHash,
      status: 'unanchored',
      error: 'Use submitProofToTSA() for real anchoring',
      retryCount: 0,
      maxRetries: 0,
      createdAt: new Date().toISOString(),
      queuedAt: new Date().toISOString(),
    };
  }

  /**
   * Submit proof to real RFC 3161 TSA (FreeTSA)
   * 
   * Submits hash to FreeTSA server and returns cryptographically
   * signed timestamp with unique serial number.
   * 
   * @param proofHash - The proof hash to anchor
   * @returns Anchor with token, or throws error
   */
  async submitProofToTSA(proofHash: string): Promise<ExternalAnchor | null> {
    try {
      console.log(`[Anchor] 🔗 Submitting proof to RFC 3161 TSA (${this.realTSAConfig.name}): ${proofHash.substring(0, 8)}...`);
      const anchor = await submitToRealTSA(proofHash, this.realTSAConfig);

      if (!anchor.tokenData) {
        throw new Error('TSA returned no token');
      }
      console.log(`[Anchor] ✅ Got anchor from ${anchor.tsaName}`);
      console.log(`[Anchor]    Time: ${anchor.authenticatedTime}`);
      console.log(`[Anchor]    Serial: ${anchor.serialNumber}`);

      const externalAnchor: ExternalAnchor = {
        status: 'anchored',
        anchoredAt: anchor.anchoredAt,
        method: 'tsa',
        proof: anchor.tokenData,
        verification: anchor.isValid ? 'valid' : 'invalid',
        tsaUrl: anchor.tsaUrl,
        tsaName: anchor.tsaName,
        tokenData: anchor.tokenData,
        authenticatedTime: anchor.authenticatedTime,
        serialNumber: anchor.serialNumber,
        hashedValue: anchor.hashedValue,
        isValid: anchor.isValid,
      };

      if (this.store) {
        this.store.anchors[proofHash] = {
          proofHash,
          status: 'confirmed',
          anchor: externalAnchor,
          retryCount: 0,
          maxRetries: 0,
          createdAt: new Date().toISOString(),
          queuedAt: new Date().toISOString(),
          anchoredAt: anchor.anchoredAt,
        };
        await this.save();
      }

      return anchor;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Anchor] ❌ Failed to anchor proof: ${message}`);
      throw error;
    }
  }

  /**
   * Set TSA configuration
   * 
   * @param config - TSA configuration (URL, name, timeout, etc.)
   */
  setTSAConfig(config: TSAConfig): void {
    this.realTSAConfig = config;
    console.log(`[Anchor] 🔐 TSA configured: ${config.name}`);
  }

  /**
   * Get current TSA config name
   */
  getTSAName(): string {
    return this.realTSAConfig.name || 'RFC 3161 TSA';
  }

  /**
   * Get anchor status for a proof
   */
  async getAnchorStatus(proofHash: string): Promise<AnchorStatus | null> {
    if (!this.store) {
      return null;
    }
    return this.store.anchors[proofHash] || null;
  }

  /**
   * Verify an existing anchor
   */
  async verifyAnchor(anchor: TSAAnchor): Promise<boolean> {
    try {
      const result = await verifyTSATimestamp(anchor);
      return result.isValid;
    } catch (error) {
      console.error('[Anchor] Verification failed:', error);
      return false;
    }
  }

  /**
   * Get all anchored proofs
   */
  async getAnchoredProofs(): Promise<Array<{ proofHash: string; anchor: ExternalAnchor }>> {
    if (!this.store) {
      return [];
    }

    return Object.entries(this.store.anchors)
      .filter(([_, status]) => status.status === 'confirmed' && status.anchor)
      .map(([proofHash, status]) => ({
        proofHash,
        anchor: status.anchor!,
      }));
  }

  /**
   * Save store to storage
   */
  private async save(): Promise<void> {
    if (!this.store) {
      return;
    }
    try {
      await AsyncStorage.setItem(
        this.config.storageKey,
        JSON.stringify(this.store)
      );
    } catch (error) {
      console.error('[Anchor] Failed to save store:', error);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AnchorServiceConfig {
    return this.config;
  }

  /**
   * Check if TSA is enabled
   */
  isTSAEnabled(): boolean {
    return this.config.tsaEnabled;
  }
}

/**
 * Factory function to get or create service instance
 */
export function getAnchorService(
  config?: Partial<AnchorServiceConfig>
): AnchorService {
  return AnchorService.getInstance(config);
}
