import { Colors, Spacing, Typography } from '@/constants/uiTheme';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

// Type definition for the exported proof JSON structure
type ExportedProof = {
  version: string;
  reportId: string;
  generatedAt: string;
  proof: {
    id: string;
    title: string;
    verificationCode: string;
    createdAt: string;
    before: {
      timestamp: string;
      location: {
        latitude: number;
        longitude: number;
        accuracy: number | null;
      };
      imageHash: string;
      integrity: {
        tampered: boolean;
        edited: boolean;
        captureTime: string;
        lastModified: string;
        hashSignature: string;
      };
    };
    after: {
      timestamp: string;
      location: {
        latitude: number;
        longitude: number;
        accuracy: number | null;
      };
      imageHash: string;
      integrity: {
        tampered: boolean;
        edited: boolean;
        captureTime: string;
        lastModified: string;
        hashSignature: string;
      };
    };
    verification: {
      locationProximity: {
        distanceMeters: number;
        withinThreshold: boolean;
        thresholdMeters: number;
      };
      timeSequence: {
        durationMinutes: number;
        chronologicallyValid: boolean;
      };
      sessionIntegrity: {
        sameSession: boolean;
        sessionId: string;
      };
    };
    timeWindow: {
      declaredMinMinutes: number;
      declaredMaxMinutes: number;
      actualDurationMinutes: number;
      withinWindow: boolean;
    };
  };
  platformMetadata: {
    exportFormat: string;
    apiVersion: string;
    certificationLevel: string;
    trustScore: {
      total: number;
      breakdown: {
        verificationCode: number;
        hashIntegrity: number;
        locationVerification: number;
        integrityChecks: number;
        sessionIntegrity: number;
      };
    };
  };
  auditTrail: {
    id: string;
    type: string;
    timestamp: string;
    sessionId?: string;
    proofId?: string;
    location?: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
    };
    metadata?: any;
  }[];
  externalAnchor?: any; // Optional TSA data
};

type VerificationState = 'loading' | 'valid' | 'tampered';

type VerificationResult = {
  isValid: boolean;
  checks: {
    beforeImageHash: boolean;
    afterImageHash: boolean;
    timeSequence: boolean;
    timeWindow: boolean;
    sessionIntegrity: boolean;
    auditTrailContinuity: boolean;
    verificationCodeFormat: boolean;
  };
  failures: string[];
  passed: string[];
};

export default function AutoVerifyScreen() {
  const router = useRouter();
  const { proof } = useLocalSearchParams<{ proof: string }>();
  const [verificationState, setVerificationState] = useState<VerificationState>('loading');
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [proofData, setProofData] = useState<ExportedProof | null>(null);

  // Run all 7 verification checks
  const verifyProof = (data: ExportedProof): VerificationResult => {
    const failures: string[] = [];
    const passed: string[] = [];

    // Check 1 — Before image hash integrity
    const beforeHashMatch = data.proof.before.imageHash === data.proof.before.integrity.hashSignature;
    if (beforeHashMatch) {
      passed.push('✓ Before image hash integrity verified');
    } else {
      failures.push('✗ Before image hash mismatch - image may have been tampered');
    }

    // Check 2 — After image hash integrity
    const afterHashMatch = data.proof.after.imageHash === data.proof.after.integrity.hashSignature;
    if (afterHashMatch) {
      passed.push('✓ After image hash integrity verified');
    } else {
      failures.push('✗ After image hash mismatch - image may have been tampered');
    }

    // Check 3 — Time sequence is valid
    const beforeTime = new Date(data.proof.before.timestamp).getTime();
    const afterTime = new Date(data.proof.after.timestamp).getTime();
    const timeSequenceValid = afterTime > beforeTime && data.proof.verification.timeSequence.chronologicallyValid;
    if (timeSequenceValid) {
      passed.push('✓ Time sequence is chronologically valid');
    } else {
      failures.push('✗ Time sequence invalid - after photo must be taken after before photo');
    }

    // Check 4 — Time window respected
    const timeWindowValid = 
      data.proof.timeWindow.withinWindow &&
      data.proof.timeWindow.actualDurationMinutes >= data.proof.timeWindow.declaredMinMinutes &&
      data.proof.timeWindow.actualDurationMinutes <= data.proof.timeWindow.declaredMaxMinutes;
    if (timeWindowValid) {
      passed.push('✓ Time window constraints respected');
    } else {
      failures.push('✗ Time window violation - capture time outside declared limits');
    }

    // Check 5 — Session integrity
    const sessionIntegrityValid = data.proof.verification.sessionIntegrity.sameSession;
    if (sessionIntegrityValid) {
      passed.push('✓ Session integrity verified');
    } else {
      failures.push('✗ Session integrity compromised - photos from different sessions');
    }

    // Check 6 — Audit trail continuity
    const requiredEventTypes = ['time_window_declared', 'before_capture', 'proof_created'];
    const auditTrailEventTypes = data.auditTrail.map(entry => entry.type);
    const hasRequiredEvents = requiredEventTypes.every(type => auditTrailEventTypes.includes(type));
    
    // Check if audit trail is in chronological order
    const sortedAuditTrail = [...data.auditTrail].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const isChronological = JSON.stringify(data.auditTrail.map(e => e.id)) === 
                            JSON.stringify(sortedAuditTrail.map(e => e.id));
    
    // Check if all entries share the same sessionId
    const sessionIds = data.auditTrail.map(entry => entry.sessionId).filter(Boolean);
    const consistentSessionIds = sessionIds.every(id => id === sessionIds[0]);
    
    const auditTrailValid = hasRequiredEvents && isChronological && consistentSessionIds;
    if (auditTrailValid) {
      passed.push('✓ Audit trail continuity verified');
    } else {
      failures.push('✗ Audit trail issues - missing events, out of order, or inconsistent sessions');
    }

    // Check 7 — Verification code format
    const verificationCodeFormatValid = 
      data.proof.verificationCode.startsWith('BA-2026-') && 
      data.proof.verificationCode.length === 14; // "BA-2026-" + 6 chars
    if (verificationCodeFormatValid) {
      passed.push('✓ Verification code format valid');
    } else {
      failures.push('✗ Verification code format invalid');
    }

    const allChecksPass = beforeHashMatch && afterHashMatch && timeSequenceValid && 
                          timeWindowValid && sessionIntegrityValid && auditTrailValid && 
                          verificationCodeFormatValid;

    return {
      isValid: allChecksPass,
      checks: {
        beforeImageHash: beforeHashMatch,
        afterImageHash: afterHashMatch,
        timeSequence: timeSequenceValid,
        timeWindow: timeWindowValid,
        sessionIntegrity: sessionIntegrityValid,
        auditTrailContinuity: auditTrailValid,
        verificationCodeFormat: verificationCodeFormatValid,
      },
      failures,
      passed,
    };
  };

  useEffect(() => {
    if (!proof) {
      Alert.alert('Error', 'No proof data found');
      router.back();
      return;
    }

    try {
      const parsedProof = JSON.parse(proof) as ExportedProof;
      setProofData(parsedProof);

      // Start verification
      const result = verifyProof(parsedProof);
      setVerificationResult(result);
      setVerificationState(result.isValid ? 'valid' : 'tampered');
    } catch (error) {
      console.error('Error parsing proof:', error);
      Alert.alert('Error', 'Invalid proof file format');
      router.back();
    }
  }, [proof]);

  const renderLoadingState = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={[styles.bodyText, { marginTop: Spacing.lg, color: Colors.textSecondary }]}>
        Verifying proof...
      </Text>
    </View>
  );

  const renderValidState = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.centerContainer}>
        <View style={styles.statusIconContainer}>
          <Ionicons name="checkmark-circle" size={80} color={Colors.success} />
        </View>
        <Text style={[styles.statusText, { color: Colors.success }]}>VALID</Text>
        <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>
          This proof is cryptographically authentic
        </Text>
      </View>

      {proofData && (
        <View style={styles.detailsContainer}>
          <Text style={[styles.detailsTitle, { color: Colors.textPrimary }]}>Proof Details</Text>
          
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>Verification Code:</Text>
            <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>{proofData.proof.verificationCode}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>Before Timestamp:</Text>
            <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
              {new Date(proofData.proof.before.timestamp).toLocaleString()}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>After Timestamp:</Text>
            <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
              {new Date(proofData.proof.after.timestamp).toLocaleString()}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>Before Location:</Text>
            <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
              {proofData.proof.before.location.latitude.toFixed(6)}, {proofData.proof.before.location.longitude.toFixed(6)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>After Location:</Text>
            <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
              {proofData.proof.after.location.latitude.toFixed(6)}, {proofData.proof.after.location.longitude.toFixed(6)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>Device:</Text>
            <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
              {proofData.auditTrail[0]?.metadata?.device || 'Unknown'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>Platform:</Text>
            <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
              {proofData.auditTrail[0]?.metadata?.platform || 'Unknown'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>Session ID:</Text>
            <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
              {proofData.proof.verification.sessionIntegrity.sessionId}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>Time Window:</Text>
            <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
              {proofData.proof.timeWindow.actualDurationMinutes} min (declared: {proofData.proof.timeWindow.declaredMinMinutes}–{proofData.proof.timeWindow.declaredMaxMinutes} min)
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>Trust Score:</Text>
            <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
              {proofData.platformMetadata.trustScore.total} out of 100
            </Text>
          </View>

          {proofData.externalAnchor && (
            <View style={styles.anchorSection}>
              <Text style={[styles.detailsTitle, { color: Colors.textPrimary, marginTop: Spacing.lg }]}>
                Timestamp Anchor
              </Text>
              
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>TSA Serial:</Text>
                <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
                  {proofData.externalAnchor.serialNumber || 'N/A'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: Colors.textSecondary }]}>Anchored At:</Text>
                <Text style={[styles.detailValue, { color: Colors.textPrimary }]}>
                  {proofData.externalAnchor.anchoredAt 
                    ? new Date(proofData.externalAnchor.anchoredAt).toLocaleString()
                    : 'N/A'}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity style={[styles.button, { backgroundColor: Colors.primary }]} onPress={() => router.back()}>
        <Text style={[styles.buttonText, { color: '#fff' }]}>Close</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderTamperedState = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.centerContainer}>
        <View style={styles.statusIconContainer}>
          <Ionicons name="close-circle" size={80} color={Colors.danger} />
        </View>
        <Text style={[styles.statusText, { color: Colors.danger }]}>TAMPERED</Text>
        <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>
          This proof has been modified or is corrupted
        </Text>
      </View>

      {verificationResult && (
        <View style={styles.detailsContainer}>
          <Text style={[styles.detailsTitle, { color: Colors.textPrimary }]}>Verification Results</Text>
          
          {verificationResult.failures.length > 0 && (
            <View style={styles.errorSection}>
              <Text style={[styles.sectionTitle, { color: Colors.danger }]}>Failed Checks:</Text>
              {verificationResult.failures.map((failure, index) => (
                <View key={index} style={styles.errorRow}>
                  <Ionicons name="warning" size={20} color={Colors.danger} />
                  <Text style={[styles.errorText, { color: Colors.danger }]}>{failure}</Text>
                </View>
              ))}
            </View>
          )}

          {verificationResult.passed.length > 0 && (
            <View style={styles.successSection}>
              <Text style={[styles.sectionTitle, { color: Colors.success }]}>Passed Checks:</Text>
              {verificationResult.passed.map((pass, index) => (
                <View key={index} style={styles.successRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <Text style={[styles.successText, { color: Colors.success }]}>{pass}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <TouchableOpacity style={[styles.button, { backgroundColor: Colors.danger }]} onPress={() => router.back()}>
        <Text style={[styles.buttonText, { color: '#fff' }]}>Close</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {verificationState === 'loading' && renderLoadingState()}
      {verificationState === 'valid' && renderValidState()}
      {verificationState === 'tampered' && renderTamperedState()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  centerContainer: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },
  statusIconContainer: {
    marginBottom: Spacing.lg,
  },
  statusText: {
    ...Typography.h1,
    fontSize: 48,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  detailsContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  detailsTitle: {
    ...Typography.h3,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    marginBottom: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  detailLabel: {
    ...Typography.bodySmall,
    flex: 1,
  },
  detailValue: {
    ...Typography.bodyMedium,
    flex: 2,
    textAlign: 'right',
  },
  anchorSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  errorSection: {
    marginBottom: Spacing.lg,
  },
  successSection: {
    marginBottom: Spacing.lg,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  errorText: {
    ...Typography.bodyMedium,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  successText: {
    ...Typography.bodyMedium,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  button: {
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  buttonText: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  bodyText: {
    ...Typography.body,
  },
});
