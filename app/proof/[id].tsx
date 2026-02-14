import { ExportButtons } from '@/components/ExportButtons';
import { ProofFingerprint } from '@/components/ProofFingerprint';
import {
  getAnchorConfidenceLevel,
  getAnchorSummary,
} from '@/lib/anchoring/verifyAnchor';
import { ExternalAnchor, LocationData, ProofRecord } from '@/lib/proof';
import { generateWorkNarrative, isApiKeyConfigured } from '@/services/aiNarrationService';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  const router = useRouter();
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
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

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

  // AI Narration Handlers
  const handleGenerateNarrative = async () => {
    if (!proof) return;

    // Check if API key is configured
    if (!isApiKeyConfigured()) {
      Alert.alert(
        'API Key Required',
        'Please add your Google Gemini API key to /services/aiNarrationService.js to use this feature.\n\nGet a free key at: https://aistudio.google.com/app/apikey',
        [{ text: 'OK' }]
      );
      return;
    }

    setGeneratingReport(true);
    setAiReport(null);

    const result = await generateWorkNarrative(
      proof.beforeUri,
      proof.afterUri
    );

    setGeneratingReport(false);

    if (result) {
      setAiReport(result);
      Alert.alert('Report Generated', 'AI work narrative is ready. You can copy it below.');
    } else {
      Alert.alert('Generation Failed', 'Unable to generate narrative. Please try again.');
    }
  };

  const copyReportToClipboard = async () => {
    if (aiReport) {
      await Clipboard.setStringAsync(aiReport);
      Alert.alert('Copied', 'Work narrative copied to clipboard');
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

  const handleDeleteProof = async () => {
    if (!proof) return;

    try {
      const stored = await AsyncStorage.getItem('proofs');
      if (!stored) return;

      const list: ProofRecord[] = JSON.parse(stored);
      const filtered = list.filter(p => p.id !== proof.id);

      console.log('Deleting proof...');
      await AsyncStorage.setItem('proofs', JSON.stringify(filtered));

      // Small delay to ensure AsyncStorage completes
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('Proof deleted, navigating back...');

      router.back();
    } catch (error) {
      console.error('Delete proof error:', error);
      // Still navigate back even if delete fails
      router.back();
    }
  };

  if (!proof) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <Ionicons name="hourglass" size={48} color="#3b82f6" style={{ marginBottom: 16 }} />
          <Text style={styles.loadingText}>Loading proof details…</Text>
        </View>
      </SafeAreaView>
    );
  }



  return (
    <>
      <Stack.Screen options={{ title: 'Proof', headerShown: true }} />
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header Section */}
          <View style={styles.headerSection}>
            <View style={styles.headerTop}>
              <View style={styles.titleContainer}>
                <Ionicons name="shield-checkmark" size={32} color="#3b82f6" />
                <Text style={styles.headerTitle}>Proof Verification</Text>
              </View>
            </View>
            <Text style={styles.headerDate}>{new Date(proof.createdAt).toLocaleString()}</Text>
          </View>

          {/* BEFORE PHOTO SECTION */}
          <View style={styles.photoSection}>
            <View style={styles.photoHeader}>
              <Ionicons name="camera" size={20} color="#3b82f6" />
              <Text style={styles.photoTitle}>Before Photo</Text>
            </View>

            {proof.beforeUri && (
              <Image
                source={{ uri: proof.beforeUri }}
                style={styles.fullPhoto}
                resizeMode="cover"
              />
            )}

            {proof.createdAt && (
              <Text style={styles.photoMetadata}>
                📅 {new Date(proof.createdAt).toLocaleString()}
              </Text>
            )}
            {proof.beforeLocation && (
              <Text style={styles.photoMetadata}>
                📍 {proof.beforeLocation.latitude.toFixed(5)}, {proof.beforeLocation.longitude.toFixed(5)}
              </Text>
            )}
          </View>

          {/* AFTER PHOTO SECTION */}
          <View style={styles.photoSection}>
            <View style={styles.photoHeader}>
              <Ionicons name="camera" size={20} color="#10b981" />
              <Text style={styles.photoTitle}>After Photo</Text>
            </View>

            {proof.afterUri && (
              <Image
                source={{ uri: proof.afterUri }}
                style={styles.fullPhoto}
                resizeMode="cover"
              />
            )}

            {!isNaN(Number(proof.id)) && (
              <Text style={styles.photoMetadata}>
                📅 {new Date(Number(proof.id)).toLocaleString()}
              </Text>
            )}
            {proof.afterLocation && (
              <Text style={styles.photoMetadata}>
                📍 {proof.afterLocation.latitude.toFixed(5)}, {proof.afterLocation.longitude.toFixed(5)}
              </Text>
            )}
          </View>

          {/* Verification Status Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="checkmark-circle" size={24} color="#3b82f6" />
              <Text style={styles.cardTitle}>Integrity Check</Text>
            </View>

            {verificationStatus === 'verifying' && (
              <View style={styles.statusContent}>
                <Ionicons name="hourglass" size={20} color="#f59e0b" />
                <Text style={styles.statusText}>Verifying proof integrity...</Text>
              </View>
            )}
            {verificationStatus === 'matched' && (
              <View style={[styles.statusContent, styles.successBg]}>
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                <Text style={[styles.statusText, styles.successText]}>Hash verified — Data authentic</Text>
              </View>
            )}
            {verificationStatus === 'mismatched' && (
              <View style={[styles.statusContent, styles.errorBg]}>
                <Ionicons name="alert-circle" size={20} color="#ef4444" />
                <Text style={[styles.statusText, styles.errorText]}>Hash mismatch — Integrity compromised</Text>
              </View>
            )}
            {verificationStatus === 'error' && (
              <View style={[styles.statusContent, styles.warningBg]}>
                <Ionicons name="warning" size={20} color="#f59e0b" />
                <Text style={[styles.statusText, styles.warningText]}>Unable to verify</Text>
              </View>
            )}
          </View>

          {/* Verification Code */}
          {proof.verificationCode && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="qr-code" size={24} color="#3b82f6" />
                <Text style={styles.cardTitle}>Verification Code</Text>
              </View>

              <View style={styles.codeContainer}>
                <Text style={styles.codeLabel}>Proof Identifier</Text>
                <Text style={styles.codeValue} selectable>{proof.verificationCode}</Text>
              </View>

              {codeVerificationStatus === 'verifying' && (
                <Text style={styles.codeStatusText}>Verifying code...</Text>
              )}
              {codeVerificationStatus === 'verified' && (
                <View style={styles.codeStatusRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                  <Text style={[styles.codeStatusText, styles.successText]}>Verified — Proof intact</Text>
                </View>
              )}
              {codeVerificationStatus === 'invalid' && (
                <View style={styles.codeStatusRow}>
                  <Ionicons name="alert-circle" size={16} color="#ef4444" />
                  <Text style={[styles.codeStatusText, styles.errorText]}>Invalid — Proof may be tampered</Text>
                </View>
              )}
              {codeVerificationStatus === 'error' && (
                <View style={styles.codeStatusRow}>
                  <Ionicons name="warning" size={16} color="#f59e0b" />
                  <Text style={[styles.codeStatusText, styles.warningText]}>Unable to verify code</Text>
                </View>
              )}
            </View>
          )}

          {/* 🆕 Visual Fingerprint Section */}
          <View style={styles.fingerprintSection}>
            <Text style={styles.sectionTitle}>🔐 Cryptographic Fingerprint</Text>

            <Text style={styles.sectionDescription}>
              This unique pattern is mathematically generated from your proof's hash.
              Any tampering will completely change this pattern.
            </Text>

            <View style={styles.fingerprintContainer}>
              <ProofFingerprint
                hash={proof.afterHash}
                size={280}
                showChecksum={true}
              />
            </View>

            <Text style={styles.hashLabel}>Hash:</Text>
            <Text style={styles.hashValue}>{proof.afterHash}</Text>
          </View>

          {/* Metadata Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="information-circle" size={24} color="#3b82f6" />
              <Text style={styles.cardTitle}>Metadata</Text>
            </View>

            <View style={styles.metadataGrid}>
              <View style={styles.metadataItem}>
                <Text style={styles.metadataLabel}>Device</Text>
                <Text style={styles.metadataValue}>{proof.deviceName}</Text>
              </View>
              <View style={styles.metadataItem}>
                <Text style={styles.metadataLabel}>Platform</Text>
                <Text style={styles.metadataValue}>{proof.platform}</Text>
              </View>
              <View style={styles.metadataItem}>
                <Text style={styles.metadataLabel}>Algorithm</Text>
                <Text style={styles.metadataValue}>{proof.algorithmVersion ? `v${proof.algorithmVersion}` : '1.0.0'}</Text>
              </View>
            </View>
          </View>

          {/* GPS Location Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="map" size={24} color="#3b82f6" />
              <Text style={styles.cardTitle}>GPS Locations</Text>
            </View>

            <View style={styles.locationItem}>
              <View style={styles.locationBadge}>
                <Ionicons name="camera" size={16} color="#3b82f6" />
                <Text style={styles.locationLabel}>Before</Text>
              </View>
              <Text style={styles.coordinateText}>
                {proof.beforeLocation.latitude.toFixed(5)}, {proof.beforeLocation.longitude.toFixed(5)}
              </Text>
              {proof.beforeLocation.accuracy !== null && (
                <Text style={styles.accuracyText}>Accuracy: ±{proof.beforeLocation.accuracy.toFixed(0)}m</Text>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.locationItem}>
              <View style={styles.locationBadge}>
                <Ionicons name="camera" size={16} color="#10b981" />
                <Text style={styles.locationLabel}>After</Text>
              </View>
              <Text style={styles.coordinateText}>
                {proof.afterLocation.latitude.toFixed(5)}, {proof.afterLocation.longitude.toFixed(5)}
              </Text>
              {proof.afterLocation.accuracy !== null && (
                <Text style={styles.accuracyText}>Accuracy: ±{proof.afterLocation.accuracy.toFixed(0)}m</Text>
              )}
            </View>

            {distance !== null && (
              <>
                <View style={styles.divider} />
                <View style={styles.distanceRow}>
                  <Ionicons name="compass" size={18} color="#3b82f6" />
                  <View style={styles.distanceContent}>
                    <Text style={styles.distanceLabel}>Geospatial Seperation Between Capture Points</Text>
                    <Text style={styles.distanceValue}>{distance.toFixed(1)} m</Text>
                  </View>
                </View>
              </>
            )}

            {locationStatus && (
              <View style={[styles.statusBadge, locationStatus === 'matched' ? styles.successBadge : styles.errorBadge]}>
                <Ionicons
                  name={locationStatus === 'matched' ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={locationStatus === 'matched' ? '#10b981' : '#ef4444'}
                />
                <Text style={[styles.statusBadgeText, locationStatus === 'matched' ? styles.successText : styles.errorText]}>
                  {locationStatus === 'matched' ? 'Within allowed range' : 'Exceeds allowed range'}
                </Text>
              </View>
            )}
          </View>

          {/* Time Analysis Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="time" size={24} color="#3b82f6" />
              <Text style={styles.cardTitle}>Time Analysis</Text>
            </View>

            <View style={styles.timeItem}>
              <View style={styles.timeBadge}>
                <Ionicons name="play-circle" size={16} color="#3b82f6" />
                <Text style={styles.timeLabel}>Work Started</Text>
              </View>
              <Text style={styles.timeValue}>{new Date(proof.createdAt).toLocaleTimeString()}</Text>
              <Text style={styles.dateValue}>{new Date(proof.createdAt).toLocaleDateString()}</Text>
            </View>

            {!isNaN(Number(proof.id)) && (
              <>
                <View style={styles.divider} />
                <View style={styles.timeItem}>
                  <View style={styles.timeBadge}>
                    <Ionicons name="stop-circle" size={16} color="#10b981" />
                    <Text style={styles.timeLabel}>Work Ended</Text>
                  </View>
                  <Text style={styles.timeValue}>{new Date(Number(proof.id)).toLocaleTimeString()}</Text>
                  <Text style={styles.dateValue}>{new Date(Number(proof.id)).toLocaleDateString()}</Text>
                </View>
              </>
            )}

            {timeGap && (
              <>
                <View style={styles.divider} />
                <View style={styles.timeGapRow}>
                  <Ionicons name="hourglass" size={18} color="#3b82f6" />
                  <View style={styles.timeGapContent}>
                    <Text style={styles.timeGapLabel}>Work Window</Text>
                    <Text style={styles.timeGapValue}>{timeGap}</Text>
                  </View>
                </View>
              </>
            )}

            {timeStatus && (
              <View style={[styles.statusBadge, timeStatus === 'matched' ? styles.successBadge : styles.errorBadge]}>
                <Ionicons
                  name={timeStatus === 'matched' ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={timeStatus === 'matched' ? '#10b981' : '#ef4444'}
                />
                <Text style={[styles.statusBadgeText, timeStatus === 'matched' ? styles.successText : styles.errorText]}>
                  {timeStatus === 'matched' ? 'Realistic work window' : 'Implausible time window'}
                </Text>
              </View>
            )}
          </View>

          {/* External Timestamp Anchor Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="link" size={24} color="#3b82f6" />
              <Text style={styles.cardTitle}>External Timestamp Anchor</Text>
            </View>

            {proof.externalAnchor ? (
              <>
                {anchorLoading ? (
                  <View style={styles.statusContent}>
                    <Ionicons name="hourglass" size={20} color="#f59e0b" />
                    <Text style={styles.statusText}>Verifying anchor...</Text>
                  </View>
                ) : anchorStatus ? (
                  <>
                    <View style={[
                      styles.statusBadge,
                      anchorStatus.confidence === 'high' ? styles.successBadge :
                        anchorStatus.confidence === 'medium' ? { backgroundColor: '#fef3c7', borderColor: '#fbbf24' } :
                          styles.errorBadge
                    ]}>
                      <Ionicons
                        name={
                          anchorStatus.confidence === 'high' ? 'checkmark-circle' :
                            anchorStatus.confidence === 'medium' ? 'alert' :
                              'close-circle'
                        }
                        size={16}
                        color={
                          anchorStatus.confidence === 'high' ? '#10b981' :
                            anchorStatus.confidence === 'medium' ? '#f59e0b' :
                              '#ef4444'
                        }
                      />
                      <Text style={[
                        styles.statusBadgeText,
                        anchorStatus.confidence === 'high' ? styles.successText :
                          anchorStatus.confidence === 'medium' ? { color: '#92400e' } :
                            styles.errorText
                      ]}>
                        {anchorStatus.humanSummary}
                      </Text>
                    </View>

                    {anchorStatus.details && anchorStatus.details.length > 0 && (
                      <View style={styles.detailsList}>
                        {anchorStatus.details.map((detail: string, idx: number) => (
                          <View key={idx} style={styles.detailItem}>
                            <Text style={styles.detailBullet}>•</Text>
                            <Text style={styles.detailText}>{detail}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={styles.placeholderText}>Unable to verify anchor data</Text>
                )}
              </>
            ) : (
              <Text style={styles.placeholderText}>
                This proof has not been anchored to an external timestamp. Once anchored, it will provide independent time verification.
              </Text>
            )}
          </View>

          {/* Technical Details Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="code-slash" size={24} color="#3b82f6" />
              <Text style={styles.cardTitle}>Technical Details</Text>
            </View>

            <View style={styles.hashContainer}>
              <Text style={styles.hashLabel}>Before Hash (SHA-256)</Text>
              <Text style={styles.hashValue} selectable>{proof.beforeHash}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.hashContainer}>
              <Text style={styles.hashLabel}>After Hash (SHA-256)</Text>
              <Text style={styles.hashValue} selectable>{proof.afterHash}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.hashContainer}>
              <Text style={styles.hashLabel}>Proof Hash (SHA-256)</Text>
              <Text style={styles.hashValue} selectable>{proof.proofHash}</Text>
            </View>
          </View>

          {/* AI Work Narrative Section */}
          <View style={styles.aiNarrativeSection}>
            <View style={styles.cardHeader}>
              <Ionicons name="create" size={24} color="#3b82f6" />
              <Text style={styles.cardTitle}>AI Work Narrative</Text>
            </View>

            {!aiReport && !generatingReport && (
              <TouchableOpacity
                style={styles.generateButton}
                onPress={handleGenerateNarrative}
              >
                <Text style={styles.generateButtonText}>✍️ Generate Work Report</Text>
              </TouchableOpacity>
            )}

            {generatingReport && (
              <View style={styles.aiLoadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.aiLoadingText}>AI analyzing photos...</Text>
              </View>
            )}

            {aiReport && (
              <View style={styles.reportContainer}>
                <ScrollView
                  style={styles.reportScrollView}
                  nestedScrollEnabled={true}
                  scrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  <Text style={styles.reportText}>{aiReport.replace(/\*\*/g, '').replace(/#{1,6}\s/g, '')}</Text>
                </ScrollView>

                <View style={styles.reportActions}>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={copyReportToClipboard}
                  >
                    <Text style={styles.copyButtonText}>📋 Copy Report</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.regenerateButton}
                    onPress={handleGenerateNarrative}
                  >
                    <Text style={styles.regenerateButtonText}>🔄 Regenerate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Export and Delete Actions */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="download" size={24} color="#3b82f6" />
              <Text style={styles.cardTitle}>Actions</Text>
            </View>

            <ExportButtons proof={proof} />

            <Pressable
              style={({ pressed }: { pressed: boolean }) => [
                styles.deleteButton,
                pressed && styles.deleteButtonPressed
              ]}
              onPress={handleDeleteProof}
            >
              <Ionicons name="trash" size={20} color="#ffffff" />
              <Text style={styles.deleteButtonText}>Delete Proof</Text>
            </Pressable>
          </View>

          {/* Spacing for safe area */}
          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  loadingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },

  // Header Section
  headerSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },

  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
  },

  headerDate: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },

  // Photo Section
  photoSection: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  photoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },

  photoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },

  fullPhoto: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    marginBottom: 12,
  },

  photoMetadata: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 6,
  },

  // Card Base
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },

  // Status Content
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },

  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    flex: 1,
  },

  successBg: {
    backgroundColor: '#f0fdf4',
  },

  successText: {
    color: '#16a34a',
  },

  errorBg: {
    backgroundColor: '#fef2f2',
  },

  errorText: {
    color: '#dc2626',
  },

  warningBg: {
    backgroundColor: '#fffbeb',
  },

  warningText: {
    color: '#b45309',
  },

  // Verification Code
  codeContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },

  codeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  codeValue: {
    fontSize: 16,
    fontFamily: 'monospace',
    color: '#3b82f6',
    fontWeight: '700',
    letterSpacing: 1,
  },

  codeStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },

  codeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },

  // Metadata
  metadataGrid: {
    gap: 12,
  },

  metadataItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },

  metadataLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  metadataValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },

  // Location
  locationItem: {
    paddingVertical: 12,
  },

  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },

  locationLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },

  coordinateText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#3b82f6',
    fontWeight: '600',
    marginBottom: 4,
  },

  accuracyText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },

  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },

  distanceContent: {
    flex: 1,
  },

  distanceLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 4,
  },

  distanceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },

  // Time
  timeItem: {
    paddingVertical: 12,
  },

  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },

  timeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },

  timeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },

  dateValue: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },

  timeGapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },

  timeGapContent: {
    flex: 1,
  },

  timeGapLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 4,
  },

  timeGapValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },

  // Status Badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
  },

  successBadge: {
    backgroundColor: '#f0fdf4',
    borderColor: '#dcfce7',
  },

  errorBadge: {
    backgroundColor: '#fef2f2',
    borderColor: '#fee2e2',
  },

  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Hash
  hashContainer: {
    paddingVertical: 12,
  },

  hashLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  hashValue: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#0f766e',
    fontWeight: '600',
    lineHeight: 18,
  },

  // Anchor Details
  detailsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },

  detailItem: {
    flexDirection: 'row',
    gap: 8,
  },

  detailBullet: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    width: 12,
  },

  detailText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },

  placeholderText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingVertical: 8,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 0,
  },

  // Delete Button
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    marginTop: 12,
  },

  deleteButtonPressed: {
    opacity: 0.8,
    backgroundColor: '#b91c1c',
  },

  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Fingerprint Section Styles
  fingerprintSection: {
    marginTop: 24,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  fingerprintContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },

  // AI Narration Styles
  aiNarrativeSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  generateButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },

  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  aiLoadingContainer: {
    padding: 30,
    alignItems: 'center',
  },

  aiLoadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 14,
  },

  reportContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  reportScrollView: {
    height: 200,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    backgroundColor: '#f8fafc',
  },

  reportText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  reportActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },

  copyButton: {
    flex: 1,
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },

  copyButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  regenerateButton: {
    flex: 1,
    backgroundColor: '#FF9500',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },

  regenerateButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
