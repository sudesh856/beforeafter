// Premium UI Layer for Capture Screen
// This wraps the existing capture logic with new premium styling

import { BorderRadius, Colors, Spacing, Typography } from '@/constants/uiTheme';
import { FileJson, Trash2 } from 'lucide-react-native';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface CaptureScreenUIProps {
  // Status
  isProcessing: boolean;
  processingMessage: string | null;
  validationError: string | null;
  beforeTaken: boolean;
  afterTaken: boolean;
  
  // Session Info
  sessionActive: boolean;
  sessionId?: string;
  
  // Time Window
  elapsedTimeMs: number;
  timeWindowStatus: 'VALID' | 'INVALID' | 'EXPIRED' | null;
  selectedMinTimeMin: number | null;
  selectedMaxTimeMin: number | null;
  
  // Metadata
  jobId: string;
  clientName: string;
  showMetadataForm: boolean;
  sessionMetadata: any;
  
  // Handlers
  onTakeBefore: () => void;
  onTakeAfter: () => void;
  onCancelSession: () => void;
  onSetTimeWindow: () => void;
  onToggleMetadataForm: () => void;
  onSaveMetadata: (jobId: string, clientName: string) => void;
  onExport: () => void;
  onCameraOpen: () => void;
  
  // State setters
  setJobId: (id: string) => void;
  setClientName: (name: string) => void;
}

export function CaptureScreenUI({
  isProcessing,
  processingMessage,
  validationError,
  beforeTaken,
  afterTaken,
  sessionActive,
  sessionId,
  elapsedTimeMs,
  timeWindowStatus,
  selectedMinTimeMin,
  selectedMaxTimeMin,
  jobId,
  clientName,
  showMetadataForm,
  sessionMetadata,
  onTakeBefore,
  onTakeAfter,
  onCancelSession,
  onSetTimeWindow,
  onToggleMetadataForm,
  onSaveMetadata,
  onExport,
  onCameraOpen,
  setJobId,
  setClientName,
}: CaptureScreenUIProps) {
  const displayTime = (elapsedTimeMs / 1000).toFixed(1);
  const isTimeValid = timeWindowStatus === 'VALID';
  const isTimeExpired = timeWindowStatus === 'EXPIRED';

  return (
    <SafeAreaView style={styles.safeContainer}>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>BeforeAfter</Text>
          <Text style={styles.subtitle}>Tamper-Evident Proof System</Text>
        </View>

        {/* Processing Indicator */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.processingText}>{processingMessage || 'Processing...'}</Text>
          </View>
        )}

        {/* Error Message */}
        {validationError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {validationError}</Text>
          </View>
        )}

        {/* Session Active Banner */}
        {sessionActive && (
          <View style={styles.sessionBanner}>
            <Text style={styles.sessionBannerTitle}>🔒 Session Active</Text>
            <Text style={styles.sessionBannerSubtitle}>
              Before photo captured. You must complete this session.
            </Text>
            {selectedMinTimeMin && selectedMaxTimeMin && (
              <View style={styles.timeWindowBanner}>
                <View style={styles.timeWindowRow}>
                  <Text style={styles.timeWindowLabel}>⏱️ Time Window</Text>
                  <Text style={styles.timeWindowValue}>
                    {selectedMinTimeMin}–{selectedMaxTimeMin} min
                  </Text>
                </View>
                <View style={styles.timeWindowRow}>
                  <Text style={styles.timeWindowLabel}>Elapsed</Text>
                  <Text style={[
                    styles.timeWindowElapsed,
                    isTimeValid && styles.timeWindowElapsedValid,
                    isTimeExpired && styles.timeWindowElapsedExpired
                  ]}>
                    {displayTime}s
                  </Text>
                </View>
                {timeWindowStatus && (
                  <View style={[
                    styles.statusChip,
                    isTimeValid && styles.statusChipValid,
                    isTimeExpired && styles.statusChipExpired
                  ]}>
                    <Text style={styles.statusChipText}>
                      {isTimeValid ? '✅ Valid' : isTimeExpired ? '❌ Expired' : '⏳ Not Ready'}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Metadata Form */}
        {showMetadataForm && (
          <View style={styles.metadataCard}>
            <Text style={styles.cardTitle}>Job Details (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Job ID"
              placeholderTextColor={Colors.textTertiary}
              value={jobId}
              onChangeText={setJobId}
            />
            <TextInput
              style={[styles.input, { marginBottom: Spacing.lg }]}
              placeholder="Client Name"
              placeholderTextColor={Colors.textTertiary}
              value={clientName}
              onChangeText={setClientName}
            />
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => onSaveMetadata(jobId, clientName)}
            >
              <Text style={styles.primaryButtonText}>Save Details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onToggleMetadataForm}
            >
              <Text style={styles.secondaryButtonText}>Skip</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Job Info Display */}
        {sessionMetadata?.jobId && !showMetadataForm && (
          <View style={styles.jobInfoCard}>
            <View style={{flexDirection:'row', alignItems:'center'}}><FileJson size={14} color={Colors.textPrimary} /><Text style={styles.jobInfoText}> {sessionMetadata.jobId}</Text></View>
            {sessionMetadata.clientName && (
              <Text style={styles.jobInfoText}>👤 {sessionMetadata.clientName}</Text>
            )}
          </View>
        )}

        {/* Main CTA Buttons */}
        <View style={styles.actionSection}>
          {!beforeTaken ? (
            <>
              {!showMetadataForm && (
                <>
                  {/* Time Window Setup */}
                  {!sessionActive && (
                    <TouchableOpacity
                      style={styles.setupButton}
                      onPress={onSetTimeWindow}
                    >
                      <Text style={styles.setupButtonText}>⏱️ Set Time Window (Required)</Text>
                      <Text style={styles.setupButtonSubtext}>Declare minimum and maximum capture time</Text>
                    </TouchableOpacity>
                  )}

                  {/* Add Job Details */}
                  <TouchableOpacity
                    style={styles.optionalButton}
                    onPress={onToggleMetadataForm}
                  >
                    <Text style={styles.optionalButtonText}>+ Add Job Details</Text>
                  </TouchableOpacity>

                  {/* Take Before Photo */}
                  <TouchableOpacity
                    style={[styles.primaryButton, isProcessing && styles.buttonDisabled]}
                    onPress={onCameraOpen}
                    disabled={isProcessing}
                  >
                    <Text style={styles.primaryButtonText}>📸 TAKE BEFORE PHOTO</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <>
              {/* Session Active - Show Take After */}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (isProcessing || isTimeExpired) && styles.buttonDisabled
                ]}
                onPress={onTakeAfter}
                disabled={isProcessing || isTimeExpired}
              >
                <Text style={styles.primaryButtonText}>📸 TAKE AFTER PHOTO</Text>
                {!isTimeValid && (
                  <Text style={styles.primaryButtonSubtext}>
                    Ready in {(selectedMinTimeMin ? selectedMinTimeMin * 60 : 0) - Math.floor(elapsedTimeMs / 1000)}s
                  </Text>
                )}
              </TouchableOpacity>

              {/* Cancel Session */}
              <TouchableOpacity
                style={styles.dangerButton}
                onPress={onCancelSession}
              >
                <View style={{flexDirection:'row', alignItems:'center'}}><Trash2 size={14} color={Colors.danger} /><Text style={styles.dangerButtonText}> Cancel Session</Text></View>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Info Footer */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>✅ How It Works</Text>
          <Text style={styles.infoText}>
            • Set time window before capture{'\n'}
            • Take Before photo (GPS tagged){'\n'}
            • Wait for minimum time{'\n'}
            • Take After photo at same location{'\n'}
            • Proof automatically verified
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
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
    marginBottom: Spacing.xxl,
  },

  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },

  subtitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },

  // Processing
  processingOverlay: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },

  processingText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },

  // Error
  errorContainer: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },

  errorText: {
    ...Typography.body,
    color: Colors.danger,
  },

  // Session Banner
  sessionBanner: {
    backgroundColor: Colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },

  sessionBannerTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },

  sessionBannerSubtitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },

  // Time Window
  timeWindowBanner: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },

  timeWindowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  timeWindowLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },

  timeWindowValue: {
    ...Typography.h3,
    color: Colors.primary,
  },

  timeWindowElapsed: {
    ...Typography.h3,
    color: Colors.textSecondary,
  },

  timeWindowElapsedValid: {
    color: Colors.success,
  },

  timeWindowElapsedExpired: {
    color: Colors.danger,
  },

  statusChip: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
  },

  statusChipValid: {
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
  },

  statusChipExpired: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },

  statusChipText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  // Metadata Card
  metadataCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },

  cardTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },

  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    ...Typography.body,
  },

  // Job Info
  jobInfoCard: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },

  jobInfoText: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },

  // Buttons
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  primaryButtonText: {
    ...Typography.h3,
    color: Colors.background,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  primaryButtonSubtext: {
    ...Typography.caption,
    color: Colors.background,
    marginTop: Spacing.xs,
    opacity: 0.8,
  },

  setupButton: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  setupButtonText: {
    ...Typography.bodyMedium,
    color: Colors.primary,
    fontWeight: '600',
  },

  setupButtonSubtext: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  optionalButton: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  optionalButtonText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '500',
  },

  secondaryButton: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  secondaryButtonText: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  dangerButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  dangerButtonText: {
    ...Typography.bodySmall,
    color: Colors.danger,
    fontWeight: '600',
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  // Action Section
  actionSection: {
    marginVertical: Spacing.lg,
  },

  // Info Card
  infoCard: {
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
