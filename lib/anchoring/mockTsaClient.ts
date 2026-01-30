/**
 * Mock TSA Client for Testing
 * 
 * Replaces RFC 3161 Timestamp Authority with a mock service for testing/demo.
 * Returns immediate mock anchor responses without real external calls.
 * 
 * FEATURES:
 * - Accepts proofHash and returns anchored status immediately
 * - Returns mock but structured external anchor metadata
 * - Fails gracefully with pending status if configured
 * - Allows showcasing timestamp anchoring without TSA setup
 * 
 * FOR PRODUCTION: Replace with real RFC 3161 TSA implementation
 */

import { ExternalAnchor, TSAAnchor } from './anchorTypes';

export interface MockTSAConfig {
  name?: string;           // Mock TSA name for UI
  simulateFailure?: boolean; // If true, returns error instead of anchored
  delayMs?: number;         // Simulate network delay
}

/**
 * Mock TSA configuration
 */
export const MOCK_TSA_CONFIG: MockTSAConfig = {
  name: 'Mock TSA',
  simulateFailure: false,
  delayMs: 500, // Simulate 500ms network delay
};

/**
 * Submit proof hash to mock TSA service
 * 
 * Returns immediate mock anchor without making real network calls.
 * For testing and demo purposes only.
 * 
 * @param proofHash - The proof hash to anchor
 * @param config - Mock TSA configuration
 * @returns Mock TSA anchor with immediate anchored status
 * @throws Error if failure simulation is enabled
 */
export async function submitToMockTSA(
  proofHash: string,
  config: MockTSAConfig = MOCK_TSA_CONFIG
): Promise<ExternalAnchor> {
  try {
    // Simulate network delay
    if (config.delayMs && config.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, config.delayMs));
    }

    // Simulate failure if configured
    if (config.simulateFailure) {
      throw new Error('Mock TSA configured to simulate failure for testing');
    }

    console.log(`[Mock TSA] 🔗 Anchoring proof: ${proofHash.substring(0, 16)}...`);

    // Generate mock timestamp (always current time)
    const now = new Date().toISOString();
    
    // Generate mock token (deterministic based on hash)
    const mockToken = `mock_tsa_token_${proofHash}_${Date.now()}`;
    
    // Generate mock serial number
    const mockSerial = `MOCK_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Create mock anchor (ExternalAnchor type)
    const mockAnchor: ExternalAnchor = {
      status: 'anchored',
      anchoredAt: now,
      method: 'mock',
      proof: mockToken,
      verification: 'valid',
      tsaUrl: 'mock://mock-tsa-service',
      tsaName: config.name || 'Mock TSA',
      tokenData: mockToken,
      authenticatedTime: now,
      serialNumber: mockSerial,
      hashedValue: proofHash,
      isValid: true, // Mock is always valid
    };

    console.log(`[Mock TSA] ✅ Mock anchor created`);
    console.log(`[Mock TSA]    Time: ${mockAnchor.authenticatedTime}`);
    console.log(`[Mock TSA]    Serial: ${mockAnchor.serialNumber}`);
    console.log(`[Mock TSA]    Token: ${mockAnchor.tokenData?.substring(0, 20)}...`);

    return mockAnchor;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Mock TSA] ❌ Mock anchoring failed: ${message}`);
    throw new Error(`Mock TSA error: ${message}`);
  }
}

/**
 * Verify mock TSA timestamp (always succeeds for testing)
 * 
 * @param anchor - Mock TSA anchor to verify
 * @returns Verification result
 */
export async function verifyMockTSATimestamp(
  anchor: TSAAnchor
): Promise<{
  isValid: boolean;
  timestamp: string;
  details: string[];
}> {
  const details: string[] = [];

  try {
    // Check token exists
    if (!anchor.tokenData) {
      return {
        isValid: false,
        timestamp: anchor.authenticatedTime,
        details: ['No token data present'],
      };
    }

    // Mock verification always succeeds
    details.push(`✅ Mock token verified: ${anchor.tsaName}`);
    details.push(`Timestamp: ${anchor.authenticatedTime}`);
    details.push(`Serial: ${anchor.serialNumber}`);
    details.push(`Token: ${anchor.tokenData.substring(0, 20)}...`);

    return {
      isValid: true,
      timestamp: anchor.authenticatedTime,
      details,
    };
  } catch (error) {
    return {
      isValid: false,
      timestamp: anchor.authenticatedTime,
      details: [`Verification error: ${error}`],
    };
  }
}

/**
 * Validate timestamp sequence (mock always validates)
 * 
 * @param proofCreatedAt - When proof was created
 * @param anchorTimestamp - When anchor was created
 * @returns Validation result
 */
export function validateMockTimestampSequence(
  proofCreatedAt: string,
  anchorTimestamp: string
): {
  valid: boolean;
  message: string;
  difference: number;
} {
  try {
    const proofTime = new Date(proofCreatedAt).getTime();
    const anchorTime = new Date(anchorTimestamp).getTime();
    const difference = anchorTime - proofTime;

    // Allow any reasonable time difference for mock
    const maxDifference = 60 * 60 * 1000; // 1 hour

    if (difference < 0) {
      return {
        valid: false,
        message: `Anchor timestamp is before proof creation`,
        difference,
      };
    }

    if (difference > maxDifference) {
      return {
        valid: false,
        message: `Anchor timestamp is too far after proof creation`,
        difference,
      };
    }

    return {
      valid: true,
      message: `Mock timestamp sequence valid (${Math.round(difference / 1000)} seconds after creation)`,
      difference,
    };
  } catch (error) {
    return {
      valid: false,
      message: `Invalid timestamp format: ${error}`,
      difference: -1,
    };
  }
}

/**
 * Get default mock TSA config
 */
export function getDefaultMockTSA(): MockTSAConfig {
  return MOCK_TSA_CONFIG;
}
