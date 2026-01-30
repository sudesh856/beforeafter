import {
    getAnchorConfidenceLevel,
    getAnchorSummary,
} from '@/lib/anchoring/verifyAnchor';
import { ExternalAnchor, LocationData, ProofRecord } from '@/lib/proof';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Verify an external anchor using real verification logic
 * Uses the verifyAnchor module to check TSA/blockchain anchors
 */
const verifyExternalAnchor = async (
  proofHash: string,
  externalAnchor: ExternalAnchor | undefined,
  createdAt: string
): Promise<{
  isValid: boolean;
  confidence: 'high' | 'medium' | 'low' | 'unanchored';
  humanSummary: string;
  details: string[];
}> => {
  // If no anchor, return unanchored status
  if (!externalAnchor) {
    return {
      isValid: false,
      confidence: 'unanchored',
      humanSummary: 'No external anchor found',
      details: ['This proof has not been anchored to an external timestamp'],
    };
  }

  // Get confidence level (high/medium/low/unanchored)
  const confidence = getAnchorConfidenceLevel(externalAnchor);

  // Get human-readable summary
  const summary = getAnchorSummary(externalAnchor, createdAt);

  return {
    isValid: externalAnchor.status === 'anchored' && externalAnchor.verification === 'valid',
    confidence,
    humanSummary: summary.status,
    details: summary.details,
  };
};
type VerificationStatus = 'verifying' | 'matched' | 'mismatched' | 'error';
type LocationStatus = 'matched' | 'mismatched';
type TimeStatus = 'matched' | 'mismatched';
type CodeVerificationStatus = 'verifying' | 'verified' | 'invalid' | 'error';

export default function ProofDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [proof, setProof] = useState<ProofRecord | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('verifying');
  const [locationStatus, setLocationStatus] = useState<LocationStatus | null>(null);
  const [timeStatus, setTimeStatus] = useState<TimeStatus | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [timeGap, setTimeGap] = useState<string | null>(null);
  const [codeVerificationStatus, setCodeVerificationStatus] = useState<CodeVerificationStatus>('verifying');
  const [isExporting, setIsExporting] = useState(false);
  const [anchorStatus, setAnchorStatus] = useState<{
    isValid: boolean;
    confidence: 'high' | 'medium' | 'low' | 'unanchored';
    humanSummary: string;
    details: string[];
  } | null>(null);
  const [anchorLoading, setAnchorLoading] = useState(false);

  // Calculate haversine distance between two coordinates in meters
  const haversineDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Create proof hash from hashes and metadata including GPS (same logic as in index.tsx)
  const createProofHash = async (
    beforeHash: string,
    afterHash: string,
    timestamp: string,
    beforeLoc: LocationData,
    afterLoc: LocationData,
    device: string,
    platform: string,
    timeWindow?: any
  ): Promise<string> => {
    const dataString = JSON.stringify({
      beforeHash,
      afterHash,
      timestamp,
      beforeLocation: {
        latitude: beforeLoc.latitude,
        longitude: beforeLoc.longitude,
        accuracy: beforeLoc.accuracy,
      },
      afterLocation: {
        latitude: afterLoc.latitude,
        longitude: afterLoc.longitude,
        accuracy: afterLoc.accuracy,
      },
      device,
      platform,
      timeWindow: timeWindow ? {
        minTimeMs: timeWindow.minTimeMs,
        maxTimeMs: timeWindow.maxTimeMs,
        actualElapsedMs: timeWindow.actualElapsedMs,
        timeSource: timeWindow.timeSource,
      } : null,
    });

    try {
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        dataString
      );
      return hash;
    } catch (error) {
      console.error('Proof hash error:', error);
      return 'hash-error';
    }
  };

  // Generate verification code deterministically from proof data (same logic as in index.tsx)
  const generateVerificationCode = async (
    beforeHash: string,
    afterHash: string,
    proofHash: string,
    timestamp: string
  ): Promise<string> => {
    try {
      const codeInput = `${beforeHash}${afterHash}${proofHash}${timestamp}`;
      const codeHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        codeInput
      );

      const year = new Date(timestamp).getFullYear();
      const codePart = codeHash.substring(0, 6).toUpperCase();

      return `BA-${year}-${codePart}`;
    } catch (error) {
      console.error('Verification code generation error:', error);
      return 'BA-0000-ERROR';
    }
  };

  // Verify proof integrity by recomputing from stored images and metadata
  // Hash verification is the ROOT OF TRUST - must happen FIRST
  // Location checks are business rules that only apply if hash is valid
  const verifyProof = async (proofRecord: ProofRecord) => {
    try {
      // ============================================
      // STEP 1: HASH VERIFICATION (ROOT OF TRUST)
      // ============================================
      // Recompute proof hash using current code
      const recomputedProofHash = await createProofHash(
        proofRecord.beforeHash,
        proofRecord.afterHash,
        proofRecord.createdAt,
        proofRecord.beforeLocation,
        proofRecord.afterLocation,
        proofRecord.deviceName,
        proofRecord.platform,
        proofRecord.timeWindow
      );

      // Compare recomputed proofHash to stored proofHash
      // This is the SINGLE SOURCE OF TRUTH for verification
      const isVerified = recomputedProofHash === proofRecord.proofHash;
      
      // Set verification status based on hash comparison
      if (isVerified) {
        setVerificationStatus('matched');
      } else {
        setVerificationStatus('mismatched');
      }

      // ============================================
      // STEP 2: BUSINESS RULES (ONLY IF HASH PASSES)
      // ============================================
      // Policy checks: Location & Time Gap
      // Only evaluate if hash is valid (data is authentic)
      if (isVerified) {
        // --- 2a: Location validation ---
        const computedDistance = haversineDistance(
          proofRecord.beforeLocation.latitude,
          proofRecord.beforeLocation.longitude,
          proofRecord.afterLocation.latitude,
          proofRecord.afterLocation.longitude
        );
        setDistance(computedDistance);

        // Apply distance constraint (100 meters)
        const distanceValid = computedDistance <= 100;
        setLocationStatus(distanceValid ? 'matched' : 'mismatched');

        // --- 2b: Time gap validation ---
        const startTime = new Date(proofRecord.createdAt).getTime();
        const endTime = Number(proofRecord.id);
        
        if (!isNaN(endTime) && startTime > 0) {
          const gapMs = endTime - startTime;

          // Same thresholds as capture: 1 min to 24 hours
          const timeValid = gapMs >= 60000 && gapMs <= 86400000;
          setTimeStatus(timeValid ? 'matched' : 'mismatched');

          // Format for display
          if (gapMs < 3600000) {
            setTimeGap(`${(gapMs / 60000).toFixed(1)}m`);
          } else {
            setTimeGap(`${(gapMs / 3600000).toFixed(1)}h`);
          }
        } else {
          setTimeStatus(null);
          setTimeGap(null);
        }
      } else {
        // Hash failed - data is untrusted
        setDistance(null);
        setLocationStatus(null);
        setTimeStatus(null);
        setTimeGap(null);
      }

      // ============================================
      // STEP 3: VERIFICATION CODE (DERIVED FROM HASH STATUS)
      // ============================================
      // Verification code is only valid if hash is valid
      // If hash fails, code must show INVALID regardless of code match
      if (proofRecord.verificationCode) {
        if (isVerified) {
          // Hash is valid - check if code matches
          const recomputedCode = await generateVerificationCode(
            proofRecord.beforeHash,
            proofRecord.afterHash,
            recomputedProofHash, // Use recomputed hash (consistent with hash verification)
            proofRecord.createdAt
          );

          if (recomputedCode === proofRecord.verificationCode) {
            setCodeVerificationStatus('verified');
          } else {
            setCodeVerificationStatus('invalid');
          }
        } else {
          // Hash failed - code is invalid regardless
          setCodeVerificationStatus('invalid');
        }
      } else {
        // Legacy proof without verification code
        // Status reflects hash verification only
        if (isVerified) {
          setCodeVerificationStatus('verified');
        } else {
          setCodeVerificationStatus('invalid');
        }
      }
    } catch (error) {
      console.error('Verification error:', error);
      setVerificationStatus('error');
      setCodeVerificationStatus('error');
      setLocationStatus(null);
      setDistance(null);
    }

    // ============================================
    // STEP 4: EXTERNAL ANCHOR VERIFICATION
    // ============================================
    // Verify any blockchain/TSA anchor if present
    if (proofRecord.externalAnchor) {
      try {
        setAnchorLoading(true);
        const result = await verifyExternalAnchor(
          proofRecord.proofHash,
          proofRecord.externalAnchor,
          proofRecord.createdAt
        );
        setAnchorStatus(result);
      } catch (error) {
        console.warn('Anchor verification error:', error);
        setAnchorStatus({
          isValid: false,
          confidence: 'low',
          humanSummary: 'Unable to verify anchor',
          details: [`Error: ${error}`],
        });
      } finally {
        setAnchorLoading(false);
      }
    } else {
      setAnchorLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      const stored = await AsyncStorage.getItem('proofs');
      if (!stored) return;

      const list: ProofRecord[] = JSON.parse(stored);
      const found = list.find(p => p.id === id);
      if (found) {
        // Handle backward compatibility: if location data is missing, create it from legacy fields
        if (!found.beforeLocation && found.latitude !== undefined && found.longitude !== undefined) {
          found.beforeLocation = {
            latitude: found.latitude,
            longitude: found.longitude,
            accuracy: null,
          };
          found.afterLocation = {
            latitude: found.latitude,
            longitude: found.longitude,
            accuracy: null,
          };
        }
        
        setProof(found);



        // Run verification immediately when proof loads
        setVerificationStatus('verifying');
        setCodeVerificationStatus('verifying');
        await verifyProof(found);
      }
    };
    load();
  }, [id]);

  if (!proof) {
    return <Text style={{ padding: 20 }}>Loading…</Text>;
  }



  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>
        Proof Record
      </Text>

      {/* Verification Status */}
      <View style={styles.verificationContainer}>
        {verificationStatus === 'verifying' && (
          <Text style={styles.verifyingText}>Verifying proof integrity...</Text>
        )}
        {verificationStatus === 'matched' && (
          <Text style={styles.matchedText}>
            ✅ HASH VERIFIED — Data authentic
          </Text>
        )}
        {verificationStatus === 'mismatched' && (
          <Text style={styles.mismatchedText}>
            ❌ HASH MISMATCH — Proof integrity compromised
          </Text>
        )}
        {verificationStatus === 'error' && (
          <Text style={styles.errorText}>
            Verification error – Unable to verify
          </Text>
        )}
      </View>

      {/* Verification Code */}
      {proof.verificationCode && (
        <View style={styles.verificationCodeContainer}>
          <Text style={styles.verificationCodeLabel}>Verification Code</Text>
          <Text style={styles.verificationCodeText} selectable>
            {proof.verificationCode}
          </Text>
          {codeVerificationStatus === 'verifying' && (
            <Text style={styles.codeVerifyingText}>Verifying code...</Text>
          )}
          {codeVerificationStatus === 'verified' && (
            <Text style={styles.codeVerifiedText}>
              ✅ VERIFIED — Proof intact
            </Text>
          )}
          {codeVerificationStatus === 'invalid' && (
            <Text style={styles.codeInvalidText}>
              ❌ INVALID — Proof may be tampered
            </Text>
          )}
          {codeVerificationStatus === 'error' && (
            <Text style={styles.codeErrorText}>
              Unable to verify code
            </Text>
          )}
        </View>
      )}

      <Text>Date: {new Date(proof.createdAt).toLocaleString()}</Text>
      <Text>Device: {proof.deviceName}</Text>
      <Text>Platform: {proof.platform}</Text>
      <Text>Algorithm: {proof.algorithmVersion ? `v${proof.algorithmVersion}` : '1.0.0 (legacy)'}</Text>

      {/* Location Information */}
      <View style={styles.locationContainer}>
        <Text style={styles.locationTitle}>GPS Locations</Text>
        <Text style={styles.locationText}>
          Before: {proof.beforeLocation.latitude.toFixed(5)}, {proof.beforeLocation.longitude.toFixed(5)}
          {proof.beforeLocation.accuracy !== null && ` (±${proof.beforeLocation.accuracy.toFixed(0)}m)`}
        </Text>
        <Text style={styles.locationText}>
  After: {proof.afterLocation.latitude.toFixed(5)}, {proof.afterLocation.longitude.toFixed(5)}
  {proof.afterLocation.accuracy !== null && (
    <Text> (±{proof.afterLocation.accuracy.toFixed(0)}m)</Text>
  )}
</Text>
        {distance !== null && (
          <Text style={styles.distanceText}>
            Distance: {distance.toFixed(1)} meter(s)
          </Text>
        )}
        {locationStatus && (
          <View style={[
            styles.locationStatusBadge,
            locationStatus === 'matched' ? styles.locationMatched : styles.locationMismatched
          ]}>
            <Text style={[
              styles.locationStatusText,
              locationStatus === 'matched' ? styles.locationMatchedText : styles.locationMismatchedText
            ]}>
              {locationStatus === 'matched'
                ? 'LOCATION VERIFIED – Within allowed range'
                : 'LOCATION INVALID – Movement exceeds allowed range'}
            </Text>
          </View>
        )}
      </View>

      {/* Time Gap Information */}
      <View style={styles.locationContainer}>
        <Text style={styles.locationTitle}>Time Analysis</Text>
        <Text style={styles.locationText}>
          Before: {new Date(proof.createdAt).toLocaleTimeString()}
        </Text>
        {!isNaN(Number(proof.id)) && (
          <Text style={styles.locationText}>
            After: {new Date(Number(proof.id)).toLocaleTimeString()}
          </Text>
        )}
        {timeGap && (
          <Text style={styles.distanceText}>
            Work Window: {timeGap}
          </Text>
        )}
        {timeStatus && (
          <View style={[
            styles.locationStatusBadge,
            timeStatus === 'matched' ? styles.locationMatched : styles.locationMismatched
          ]}>
            <Text style={[
              styles.locationStatusText,
              timeStatus === 'matched' ? styles.locationMatchedText : styles.locationMismatchedText
            ]}>
              {timeStatus === 'matched'
                ? 'TIME VERIFIED – Realistic work window'
                : 'TIME INVALID – Window is implausible'}
            </Text>
          </View>
        )}
      </View>

      {/* External Timestamp Anchor */}
      {proof.externalAnchor && (
        <View style={[styles.locationContainer, { marginTop: 20, borderColor: '#4CAF50', borderWidth: 1 }]}>
          <Text style={styles.locationTitle}>🔗 External Timestamp Anchor</Text>
          {anchorLoading ? (
            <Text style={{ fontStyle: 'italic', color: '#888', marginVertical: 8 }}>
              Verifying anchor...
            </Text>
          ) : anchorStatus ? (
            <>
              <View style={[
                styles.locationStatusBadge,
                anchorStatus.confidence === 'high'
                  ? { backgroundColor: '#1B5E20' }
                  : anchorStatus.confidence === 'medium'
                  ? { backgroundColor: '#F57F17' }
                  : { backgroundColor: '#B71C1C' }
              ]}>
                <Text style={styles.locationStatusText}>
                  {proof.externalAnchor?.status === 'failed' 
                    ? '❌ ' : anchorStatus.confidence === 'high'
                    ? '✅ ' : anchorStatus.confidence === 'medium'
                    ? '⏳ ' : '⚠️ '}
                  {anchorStatus.humanSummary}
                </Text>
              </View>
              {anchorStatus.details && anchorStatus.details.length > 0 && (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopColor: '#444', borderTopWidth: 1 }}>
                  {anchorStatus.details.map((detail: string, idx: number) => (
                    <Text
                      key={idx}
                      style={{
                        color: '#AAA',
                        fontSize: 12,
                        marginVertical: 2,
                        fontFamily: 'monospace',
                      }}
                    >
                      • {detail}
                    </Text>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={{ color: '#888', marginVertical: 8 }}>
              Anchor data present but unable to verify
            </Text>
          )}
        </View>
      )}

      {!proof.externalAnchor && (
        <View style={[styles.locationContainer, { marginTop: 20, opacity: 0.6 }]}>
          <Text style={styles.locationTitle}>🔗 External Timestamp Anchor</Text>
          <Text style={{ color: '#AAA', marginVertical: 8 }}>
            This proof has not yet been anchored to an external timestamp source. Once anchored, it will provide independent time verification via blockchain or RFC 3161 Timestamp Authority.
          </Text>
        </View>
      )}

      
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  verificationContainer: {
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  verifyingText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  matchedText: {
    color: '#0f0',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  mismatchedText: {
    color: '#f00',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    color: '#ff8800',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  verificationCodeContainer: {
    marginTop: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  verificationCodeLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  verificationCodeText: {
    color: '#0ff',
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 2,
    marginBottom: 12,
    textAlign: 'center',
  },
  codeVerifyingText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  codeVerifiedText: {
    color: '#0f0',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  codeInvalidText: {
    color: '#f00',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  codeErrorText: {
    color: '#ff8800',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  locationContainer: {
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  locationTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  locationText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  distanceText: {
    color: '#0ff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  locationStatusBadge: {
    marginTop: 12,
    padding: 8,
    borderRadius: 6,
  },
  locationMatched: {
    backgroundColor: '#001a00',
    borderWidth: 1,
    borderColor: '#0f0',
  },
  locationMismatched: {
    backgroundColor: '#1a0000',
    borderWidth: 1,
    borderColor: '#f00',
  },
  locationStatusText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  locationMatchedText: {
    color: '#0f0',
  },
  locationMismatchedText: {
    color: '#f00',
  },
  exportContainer: {
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  exportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  exportSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  exportButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#5856D6',
  },
  disabledButton: {
    opacity: 0.6,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
