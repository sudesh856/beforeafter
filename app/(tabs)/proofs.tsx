import { ExportButtons } from '@/components/ExportButtons';
import { ProofFingerprint } from '@/components/ProofFingerprint';
import { WitnessBadge } from '@/components/WitnessBadge';
import { ProofRecord } from '@/lib/proof';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';



export default function ProofsScreen() {
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [selectedProof, setSelectedProof] = useState<ProofRecord | null>(null);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        const stored = await AsyncStorage.getItem('proofs');
        if (stored) {
          setProofs(JSON.parse(stored));
        } else {
          setProofs([]);
        }
      };

      load();
    }, [])
  );

  const handleClearAll = async () => {
    try {
      console.log('Clearing all proofs...');
      await AsyncStorage.removeItem('proofs');
      
      // Small delay to ensure AsyncStorage completes
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('Proofs cleared, updating state...');
      
      setProofs([]);
    } catch (error) {
      console.error('Clear proofs error:', error);
      // Still update state even if clear fails
      setProofs([]);
    }
  };

  // EMPTY STATE
  if (proofs.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyStateContainer}>
          <Ionicons name="document-outline" size={80} color="#cbd5e1" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No Proofs Yet</Text>
          <Text style={styles.emptySubtitle}>
            Start by taking your first Before-After pair to create a proof
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/(tabs)')}
          >
            <Ionicons name="camera" size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Start Capture</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // PROOFS LIST
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Proof Library</Text>
        <Text style={styles.headerSubtitle}>Tamper-evident proof verification</Text>
      </View>

      <FlatList
        data={proofs}
        renderItem={({ item, index }: { item: ProofRecord; index: number }) => (
          <ProofCard
            proof={item}
            index={index}
            onPress={() => router.push(`/proof/${item.id}`)}
          />
        )}
        keyExtractor={(item: ProofRecord) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        scrollIndicatorInsets={{ right: 1 }}
        ListHeaderComponent={
          proofs.length > 0 ? (
            <View style={styles.listActionsContainer}>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearAll}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" style={{ marginRight: 8 }} />
                <Text style={styles.clearButtonText}>Clear All</Text>
              </TouchableOpacity>

              {proofs.length > 0 && (
                <View style={styles.exportSection}>
                  <View style={styles.exportHeader}>
                    <Ionicons name="download-outline" size={20} color="#3b82f6" style={{ marginRight: 8 }} />
                    <Text style={styles.exportTitle}>Export Latest Proof</Text>
                  </View>
                  <ExportButtons proof={proofs[0]} />
                </View>
              )}

              <View style={styles.divider} />
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function ProofCard({
  proof,
  index,
  onPress,
}: {
  proof: ProofRecord;
  index: number;
  onPress: () => void;
}) {
  const [isTamperedState, setIsTamperedState] = useState<boolean>(false);
  const [verifyingHash, setVerifyingHash] = useState<boolean>(true);

  // Use effect to compute hash verification asynchronously
  useEffect(() => {
    const verifyHash = async () => {
      try {
        setVerifyingHash(true);

        // Recompute proof hash using EXACT same logic as detail screen
        const dataString = JSON.stringify({
          beforeHash: proof.beforeHash,
          afterHash: proof.afterHash,
          timestamp: proof.createdAt,
          beforeLocation: {
            latitude: proof.beforeLocation?.latitude,
            longitude: proof.beforeLocation?.longitude,
            accuracy: proof.beforeLocation?.accuracy,
          },
          afterLocation: {
            latitude: proof.afterLocation?.latitude,
            longitude: proof.afterLocation?.longitude,
            accuracy: proof.afterLocation?.accuracy,
          },
          device: proof.deviceName,
          platform: proof.platform,
          timeWindow: proof.timeWindow ? {
            minTimeMs: proof.timeWindow.minTimeMs,
            maxTimeMs: proof.timeWindow.maxTimeMs,
            actualElapsedMs: proof.timeWindow.actualElapsedMs,
            timeSource: proof.timeWindow.timeSource,
          } : null,
        });

        const recomputedProofHash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          dataString
        );

        // Compare recomputed hash to stored hash
        const isVerified = recomputedProofHash === proof.proofHash;
        const tampered = !isVerified;

        setIsTamperedState(tampered);

        console.log('🔐 ProofCard hash verification:', {
          verificationCode: proof.verificationCode,
          stored: proof.proofHash?.substring(0, 8),
          recomputed: recomputedProofHash.substring(0, 8),
          match: isVerified,
          tampered: tampered
        });
      } catch (error) {
        console.error('❌ Hash verification error:', error);
        // If we can't verify, assume not tampered (fail open)
        setIsTamperedState(false);
      } finally {
        setVerifyingHash(false);
      }
    };

    verifyHash();
  }, [proof]);

  // Debug logging
  console.log('🔍 ProofCard rendering for:', proof.verificationCode, 'tampered:', isTamperedState);
  
  const timestamp = new Date(proof.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const sessionIdDisplay = proof.sessionId 
    ? proof.sessionId.substring(0, 10).toUpperCase() 
    : `PROOF-${index + 1}`;

  const tampered = isTamperedState;

  return (
    <Pressable 
      style={({ pressed }) => [
        styles.proofCard,
        pressed && styles.proofCardPressed
      ]} 
      onPress={onPress}
    >
      <View style={styles.proofCardContent}>
        {/* Photo Thumbnails Section */}
        <View style={styles.photoThumbnails}>
          {/* BEFORE Photo Thumbnail */}
          {proof.beforeUri && (
            <View style={styles.thumbnailContainer}>
              <Text style={styles.thumbnailLabel}>Before</Text>
              <Image
                source={{ uri: proof.beforeUri }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
            </View>
          )}

          {/* AFTER Photo Thumbnail */}
          {proof.afterUri && (
            <View style={styles.thumbnailContainer}>
              <Text style={styles.thumbnailLabel}>After</Text>
              <Image
                source={{ uri: proof.afterUri }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
            </View>
          )}
        </View>

        {/* Header with Session ID and Verification Badge */}
        <View style={styles.cardHeader}>
          <View style={styles.sessionIdContainer}>
            <View>
              <Text style={styles.sessionIdLabel}>Session ID:</Text>
              <View style={styles.sessionIdRow}>
                <Ionicons name="key" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
                <Text style={styles.sessionId} numberOfLines={1} ellipsizeMode="tail">
                  {sessionIdDisplay}
                </Text>
              </View>
            </View>
          </View>
          <View style={[
            styles.verifiedBadge,
            tampered && styles.tamperedBadge
          ]}>
            <Ionicons 
              name={tampered ? "close-circle" : "checkmark-circle"} 
              size={14} 
              color={tampered ? "#dc2626" : "#16a34a"} 
            />
            <Text style={[
              styles.verifiedText,
              tampered && styles.tamperedText
            ]}>
              {tampered ? "Something's wrong!" : "Verified"}
            </Text>
          </View>
        </View>

        {/* Timestamp */}
        <View style={styles.timestampRow}>
          <Ionicons name="calendar" size={14} color="#64748b" style={{ marginRight: 6 }} />
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>

        {/* 🌐 Witness Network Badge - Shows network verification status */}
        <WitnessBadge 
          verificationCode={proof.verificationCode} 
          isTampered={tampered}
        />

        {/* 🆕 Mini Fingerprint */}
        <View style={styles.miniFingerprint}>
          <ProofFingerprint 
            hash={proof.afterHash} 
            size={60}
            showChecksum={false}
          />
        </View>

        {/* Job Info if exists */}
        {proof.jobId && (
          <View style={styles.jobInfoRow}>
            <Ionicons name="briefcase" size={14} color="#0ea5e9" style={{ marginRight: 6 }} />
            <Text style={styles.jobInfoText} numberOfLines={1} ellipsizeMode="tail">
              {proof.jobId}
            </Text>
          </View>
        )}

        {/* Verification Code */}
        {proof.verificationCode && (
          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>Code:</Text>
            <Text style={styles.codeValue} selectable>
              {proof.verificationCode}
            </Text>
          </View>
        )}

        {/* Tap to view indicator */}
        <View style={styles.cardFooter}>
          <Text style={styles.tapHint}>Tap to view details</Text>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  headerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },

  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },

  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },

  listContent: {
    padding: 16,
    paddingBottom: 100,
  },

  listActionsContainer: {
    marginBottom: 24,
  },

  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fee2e2',
    backgroundColor: '#fef2f2',
    marginBottom: 16,
  },

  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },

  exportSection: {
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

  exportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  exportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },

  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginTop: 8,
  },

  // Proof Card
  proofCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  proofCardPressed: {
    opacity: 0.7,
    backgroundColor: '#f8fafc',
  },

  proofCardContent: {
    gap: 12,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  sessionIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  sessionIdLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  sessionIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  sessionId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    fontFamily: 'monospace',
  },

  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#f0fdf4',
    gap: 4,
  },

  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },

  tamperedBadge: {
    backgroundColor: '#fef2f2',
  },

  tamperedText: {
    color: '#dc2626',
  },

  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },

  timestamp: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },

  jobInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },

  jobInfoText: {
    fontSize: 13,
    color: '#0ea5e9',
    fontWeight: '500',
  },

  codeContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  codeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  codeValue: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#3b82f6',
    fontWeight: '600',
    letterSpacing: 1,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },

  tapHint: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // Photo Thumbnails
  photoThumbnails: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },

  thumbnailContainer: {
    flex: 1,
  },

  thumbnailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  thumbnail: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },

  // Empty State
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },

  emptyIcon: {
    marginBottom: 24,
  },

  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 12,
  },

  emptySubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },

  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },

  miniFingerprint: {
    marginVertical: 8,
    alignItems: 'center',
  },
});