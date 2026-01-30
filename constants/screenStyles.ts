import { BorderRadius, Colors, Shadows, Spacing, Typography } from '@/constants/uiTheme';
import { StyleSheet } from 'react-native';

export const CaptureScreenStyles = StyleSheet.create({
  // Main Container
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  safeContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },

  scrollContent: {
    flexGrow: 1,
  },

  // Header Section
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

  // Status Badge
  statusBadge: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginVertical: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },

  statusBadgeText: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  statusBadgeSubtext: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },

  // Time Window Section
  timeWindowSection: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginVertical: Spacing.lg,
    ...Shadows.md,
  },

  timeWindowLabel: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },

  timeWindowDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: Spacing.md,
  },

  timeWindowValue: {
    ...Typography.h2,
    color: Colors.primary,
  },

  timeWindowStatus: {
    ...Typography.caption,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceAlt,
    color: Colors.textSecondary,
  },

  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    marginVertical: Spacing.md,
  },

  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },

  // Session Info
  sessionInfo: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginVertical: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },

  sessionText: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },

  sessionSubtext: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },

  // Metadata Form
  metadataSection: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginVertical: Spacing.lg,
  },

  formTitle: {
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

  // Buttons
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginVertical: Spacing.md,
    ...Shadows.md,
  },

  primaryButtonText: {
    ...Typography.h3,
    color: Colors.background,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  secondaryButton: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginVertical: Spacing.md,
  },

  secondaryButtonText: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  dangerButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginVertical: Spacing.md,
  },

  dangerButtonText: {
    ...Typography.bodyMedium,
    color: Colors.danger,
    fontWeight: '600',
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  // Error/Validation
  errorContainer: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginVertical: Spacing.lg,
  },

  errorText: {
    ...Typography.body,
    color: Colors.danger,
  },

  // Footer Info
  footerInfo: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },

  footerInfoText: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    lineHeight: 20,
  },

  // Loading State
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },

  loadingText: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
  },

  // Camera Container
  captureContainer: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },

  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    borderWidth: 3,
    borderColor: Colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.lg,
  },

  captureButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primary,
  },

  cancelButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: BorderRadius.lg,
  },

  cancelButtonText: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },

  // Permissions
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
  },

  permissionText: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },

  permissionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },

  permissionButtonText: {
    ...Typography.bodyMedium,
    color: Colors.background,
    fontWeight: '600',
  },
});

export const ProofsScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },

  // Header
  header: {
    marginBottom: Spacing.xxl,
    paddingTop: Spacing.xl,
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
  },

  emptyStateIcon: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },

  emptyStateText: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },

  emptyStateSubtext: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // Grid Container
  gridContainer: {
    marginBottom: Spacing.xl,
  },

  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
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

  proofImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: Colors.surfaceAlt,
  },

  proofInfo: {
    padding: Spacing.md,
  },

  proofTimestamp: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },

  proofMeta: {
    ...Typography.caption,
    color: Colors.textTertiary,
    marginBottom: 2,
  },

  proofStatus: {
    ...Typography.caption,
    color: Colors.success,
    marginTop: Spacing.sm,
    fontWeight: '600',
  },

  // Export Buttons Section
  exportSection: {
    marginVertical: Spacing.xl,
  },

  exportTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },

  exportButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },

  exportChip: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    flex: 1,
    minWidth: '45%',
    ...Shadows.sm,
  },

  exportChipPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  exportChipText: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },

  exportChipTextPrimary: {
    color: Colors.background,
  },

  exportChipSubtext: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },

  exportChipSubtextPrimary: {
    color: 'rgba(13, 13, 13, 0.7)',
  },

  // Clear Button
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

  // Info Box
  infoBox: {
    backgroundColor: Colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginVertical: Spacing.lg,
  },

  infoBoxText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    lineHeight: 20,
  },

  // Tamper Warning
  tamperWarning: {
    backgroundColor: 'rgba(255, 179, 0, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginVertical: Spacing.lg,
  },

  tamperWarningText: {
    ...Typography.bodyMedium,
    color: Colors.warning,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },

  tamperWarningSubtext: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
});
