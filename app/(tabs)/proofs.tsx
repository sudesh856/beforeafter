import { ExportButtons } from '@/components/ExportButtons';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/uiTheme';
import { ProofRecord } from '@/lib/proof';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';



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
    await AsyncStorage.removeItem('proofs');
    setProofs([]);
  };

  // EMPTY STATE
  if (proofs.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No Proofs Yet</Text>
          <Text style={styles.emptySubtitle}>
            Start by taking your first Before-After pair
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/(tabs)')}
          >
            <Text style={styles.primaryButtonText}>Go to Capture</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // PROOFS LIST
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Proof Library</Text>
          <Text style={styles.headerSubtitle}>
            {proofs.length} verified proof{proofs.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Clear Button */}
        <TouchableOpacity
          style={styles.clearButton}
          onPress={handleClearAll}
        >
          <Text style={styles.clearButtonText}>🗑️ Clear All Proofs</Text>
        </TouchableOpacity>

        {/* Export Section */}
        {proofs.length > 0 && (
          <View style={styles.exportSection}>
            <Text style={styles.sectionTitle}>📤 Export Latest</Text>
            <ExportButtons proof={proofs[0]} />
          </View>
        )}

        {/* Proofs Grid */}
        <View style={styles.gridSection}>
          <Text style={styles.sectionTitle}>🔐 All Proofs</Text>
          <View style={styles.gridContainer}>
            {proofs.map((proof, index) => (
              <ProofGridItem
                key={proof.id}
                proof={proof}
                index={index}
                onPress={() => router.push(`/proof/${proof.id}`)}
              />
            ))}
          </View>
        </View> 

        
      </ScrollView>
    </SafeAreaView>
  );
}

function ProofGridItem({
  proof,
  index,
  onPress,
}: {
  proof: ProofRecord;
  index: number;
  onPress: () => void;
}) {
  const timestamp = new Date(proof.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Pressable style={styles.gridItem} onPress={onPress}>
      <View style={styles.proofCard}>
        {/* Dual Image Comparison */}
        <View style={styles.dualImageContainer}>
          {/* Before Image */}
          <View style={styles.imageComparison}>
            <Image
              source={{ uri: proof.beforeUri }}
              style={styles.proofImage}
            />
            <View style={styles.imageLabelBottom}>
              <Text style={styles.imageLabelText}>BEFORE</Text>
            </View>
          </View>

          {/* After Image */}
          <View style={styles.imageComparison}>
            <Image
              source={{ uri: proof.afterUri }}
              style={styles.proofImage}
            />
            <View style={styles.imageLabelBottom}>
              <Text style={styles.imageLabelText}>AFTER</Text>
            </View>
          </View>
        </View>

        {/* Card Info */}
        <View style={styles.proofInfo}>
          <Text style={styles.proofTimestamp}>{timestamp}</Text>
          
          {proof.jobId && (
            <Text style={styles.proofMeta}>📋 {proof.jobId}</Text>
          )}
          
          
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  scrollContainer: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },

  // Header
  header: {
    marginBottom: Spacing.xl,
    paddingTop: Spacing.lg,
  },

  headerTitle: {
    ...Typography.h1,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },

  headerSubtitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },

  // Empty State
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },

  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },

  emptyTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },

  emptySubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },

  // Buttons
  clearButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },

  clearButtonText: {
    ...Typography.bodyMedium,
    color: Colors.danger,
    fontWeight: '600',
  },

  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },

  primaryButtonText: {
    ...Typography.bodyMedium,
    color: Colors.background,
    fontWeight: '600',
  },

  // Sections
  exportSection: {
    marginBottom: Spacing.xl,
  },

  gridSection: {
    marginBottom: Spacing.xl,
  },

  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },

  // Grid
  gridContainer: {
    gap: Spacing.lg,
  },

  gridItem: {
    flex: 1,
  },

  // Proof Card
  proofCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.md,
  },

  dualImageContainer: {
    flexDirection: 'row',
    height: 180,
    backgroundColor: Colors.surfaceAlt,
  },

  imageComparison: {
    flex: 1,
    position: 'relative',
    borderRightWidth: 1,
    borderRightColor: Colors.background,
  },

  imageContainer: {
    position: 'relative',
    aspectRatio: 1,
    backgroundColor: Colors.surfaceAlt,
  },

  proofImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  imageLabel: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },

  imageLabelBottom: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 3,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },

  imageLabelText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 11,
  },

  // Proof Info
  proofInfo: {
    padding: Spacing.lg,
  },

  proofTimestamp: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },

  proofMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },

  proofStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  proofStatus: {
    ...Typography.caption,
    color: Colors.success,
    fontWeight: '600',
  },

  proofCode: {
    ...Typography.caption,
    color: Colors.textTertiary,
    fontFamily: 'monospace',
  },

  // Info Box
  infoBox: {
    backgroundColor: Colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxl,
  },

  infoTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },

  infoText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
});