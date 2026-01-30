/**
 * Anchor Service - DUAL MODE (MOCK + REAL RFC 3161 TSA)
 * 
 * Supports both modes, switchable via useRealTSA flag:
 * 
 * MOCK MODE (useRealTSA: false, default):
 * - Returns immediate anchored response
 * - Perfect for testing and demo
 * - No external dependencies
 * 
 * REAL MODE (useRealTSA: true):
 * - Submits to real RFC 3161 TSA endpoints
 * - Returns cryptographically signed timestamp
 * - Requires network connectivity
 * - Slower (depends on TSA response time)
 * 
 * When a proof is created:
 * 1. App submits proofHash to selected TSA (mock or real)
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
    getDefaultMockTSA,
    submitToMockTSA,
    verifyMockTSATimestamp
} from './mockTsaClient';
import {
    TSAConfig,
    submitToRealTSA,
    verifyTSATimestamp
} from './tsaClient';

const DEFAULT_CONFIG: AnchorServiceConfig = {
  batchSize: 10,
  batchTimeoutMs: 5 * 60 * 1000,
  blockchainEnabled: false,        // Not used
  tsaEnabled: true,                // Mock TSA is always enabled
  maxRetries: 2,
  retryDelayMs: 2000,
  retryBackoffMultiplier: 2,
  minBlockConfirmations: 6,
  storageKey: 'anchor_store',
  tsaUrl: 'mock://mock-tsa-service', // Mock TSA URL
};

/**
 * Main anchor service singleton
 * Supports both mock and real RFC 3161 TSA based on config
 */
export class AnchorService {
  private static instance: AnchorService;
  private config: AnchorServiceConfig;
  private store: AnchorStore | null = null;
  private useRealTSA: boolean = false; // Toggle between mock and real TSA
  private realTSAConfig: TSAConfig | null = null;

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
   * Submit proof to TSA (mock or real, based on config)
   * 
   * DUAL MODE:
   * - If useRealTSA: true → submits to real RFC 3161 TSA endpoint
   * - If useRealTSA: false → uses mock TSA for immediate response
   * Submit proof to TSA (mock or real, based on config)
   * 
   * DUAL MODE:
   * - If useRealTSA: true → submits to real RFC 3161 TSA endpoint
   * - If useRealTSA: false → uses mock TSA for immediate response
   * 
   * This is the testing method. It:
   * 1. Submits hash to selected TSA service (mock or real)
   * 2. Receives token back (immediately for mock, async for real)
   * 3. Stores token in proof for verification
   * 4. Returns anchored status
   * 
   * FOR PRODUCTION SWITCHING:
   * - Set useRealTSA: true and provide TSA config
   * - Replace with real RFC 3161 TSA submission
   * 
   * @param proofHash - The proof hash to anchor
   * @returns Anchor with token, or throws error
   */
  async submitProofToTSA(proofHash: string): Promise<ExternalAnchor | null> {
    try {
      let anchor: ExternalAnchor;

      if (this.useRealTSA && this.realTSAConfig) {
        // REAL TSA MODE
        console.log(`[Anchor] 🔗 Submitting proof to REAL RFC 3161 TSA: ${proofHash.substring(0, 8)}...`);
        anchor = await submitToRealTSA(proofHash, this.realTSAConfig);
      } else {
        // MOCK TSA MODE (default)
        console.log(`[Anchor] 🔗 Submitting proof to MOCK TSA: ${proofHash.substring(0, 8)}...`);
        const mockConfig = getDefaultMockTSA();
        anchor = await submitToMockTSA(proofHash, mockConfig);
      }

      // Verify we got a valid token
      if (!anchor.tokenData) {
        throw new Error('TSA returned no token');
      }
      console.log(`[Anchor] ✅ Got anchor from ${anchor.tsaName}`);
      console.log(`[Anchor]    Time: ${anchor.authenticatedTime}`);
      console.log(`[Anchor]    Serial: ${anchor.serialNumber}`);
      
      // Convert TSAAnchor to ExternalAnchor for storage
      const externalAnchor: ExternalAnchor = {
        status: 'anchored',
        anchoredAt: anchor.anchoredAt,
        method: this.useRealTSA ? 'tsa' : 'mock',
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
      
      // Save anchor to storage
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
   * Enable real RFC 3161 TSA for next anchor submissions
   * 
   * @param config - TSA configuration (URL, name, timeout, etc.)
   */
  enableRealTSA(config: TSAConfig): void {
    this.useRealTSA = true;
    this.realTSAConfig = config;
    console.log(`[Anchor] 🔐 Real RFC 3161 TSA enabled: ${config.name}`);
  }

  /**
   * Disable real TSA and use mock for testing
   */
  disableRealTSA(): void {
    this.useRealTSA = false;
    this.realTSAConfig = null;
    console.log(`[Anchor] 🧪 Switched to mock TSA for testing`);
  }

  /**
   * Check if real TSA is currently enabled
   */
  isRealTSAEnabled(): boolean {
    return this.useRealTSA;
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
   * Verify an existing anchor (handles both mock and real TSA)
   */
  async verifyAnchor(anchor: TSAAnchor): Promise<boolean> {
    try {
      // Use real verification for real TSA, mock for mock TSA
      let result;
      if (anchor.tokenData?.startsWith('mock_')) {
        result = await verifyMockTSATimestamp(anchor);
      } else {
        result = await verifyTSATimestamp(anchor);
      }
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
