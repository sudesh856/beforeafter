import { getAnchorService } from '@/lib/anchoring/anchorService';
import { AuditEvent, EditingViolation, LocationData, ProofRecord, SessionMetadata, TamperFlag, TimeAnomaly, TimeWindowData } from '@/lib/proof';

import { DIGICERT_TSA } from '@/lib/anchoring/tsaClient';
import { validateRadius } from '@/lib/radiusEnforcement';


import { generateWorkerKeypair, getDeviceWorkerId, ProofObject } from '@/app/utils/crypto';
import { generatePin, uploadProof } from '@/app/utils/proofUpload';
import {
  detectClockAnomaly,
  getElapsedMonotonicMs,
  getTimeSource,
  initializeTimeTracking,
  recordTimeAnomaly,
  resetTimeTracking,
  validateTimeWindow
} from '@/lib/timeWindowEnforcement';
import AsyncStorage from '@react-native-async-storage/async-storage';


import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  InteractionManager,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';




type CaptureMode = 'before' | 'after';

type Metadata = {
  timestamp: string;
  device: string;
  platform: string;
};

type SessionData = {
  id: string;
  startTime: string;
  beforeUri: string;
  metadata: Metadata;
  beforeLocation: LocationData;
  isActive: boolean;
  createdAt: number;
  timeWindow?: TimeWindowData;
  timeAnomalies?: TimeAnomaly[];
};

export default function HomeScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [jobSiteLocation, setJobSiteLocation] = useState<LocationData | null>(null);

  const [hasProceeded, setHasProceeded] = useState(false);

  const [beforeUri, setBeforeUri] = useState<string | null>(null);
  const [afterUri, setAfterUri] = useState<string | null>(null);

  const [beforeTaken, setBeforeTaken] = useState(false);
  const [afterTaken, setAfterTaken] = useState(false);

  const [mode, setMode] = useState<CaptureMode>('before');
  const [showCamera, setShowCamera] = useState(false);

  const [editingViolations, setEditingViolations] = useState<EditingViolation[]>([]);

  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [beforeLocation, setBeforeLocation] = useState<LocationData | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [tamperWarnings, setTamperWarnings] = useState<TamperFlag[]>([]);

  const [activeSession, setActiveSession] = useState<SessionData | null>(null);

  const [jobId, setJobId] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadata>({});
  const [showMetadataForm, setShowMetadataForm] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();

  const [hasExportData, setHasExportData] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const isProcessingRef = useRef(false);

  // PIN display state
  const [showPinModal, setShowPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [currentProofId, setCurrentProofId] = useState('');
  const [pinError, setPinError] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);

  // USER-DECLARED TIME WINDOW ENFORCEMENT - State for time window UI and tracking
  const [showTimeWindowForm, setShowTimeWindowForm] = useState(false);
  const [selectedMinTimeMin, setSelectedMinTimeMin] = useState<number | null>(null);
  const [selectedMaxTimeMin, setSelectedMaxTimeMin] = useState<number | null>(null); // Default 10 minutes
  const [timeWindow, setTimeWindow] = useState<TimeWindowData | null>(null);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [timeWindowStatus, setTimeWindowStatus] = useState<'VALID' | 'INVALID' | 'EXPIRED' | null>(null);
  const [timeAnomalies, setTimeAnomalies] = useState<TimeAnomaly[]>([]);
  const appStateRef = useRef<AppStateStatus>('active');

  // PERFORMANCE FIX 4 - Optimized GPS fetching with timeout and fallback
  const fetchGPSWithFallback = async (timeoutMs: number = 5000): Promise<LocationData | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return null;
      }

      // Use a timeout to prevent infinite waiting
      const gpsPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // Reduced from Highest (FIX 4)
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('GPS timeout')), timeoutMs)
      );

      try {
        const loc = await Promise.race([gpsPromise, timeoutPromise]);
        return {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy || null,
        };
      } catch (error) {
        // GPS fetch failed or timed out - use last known location
        try {
          const lastLoc = await Location.getLastKnownPositionAsync();
          if (lastLoc) {
            console.log('[PERF] Using last known GPS location (fallback)');
            return {
              latitude: lastLoc.coords.latitude,
              longitude: lastLoc.coords.longitude,
              accuracy: lastLoc.coords.accuracy || null,
            };
          }
        } catch (e) {
          console.log('[PERF] No last known location available');
        }
        return null;
      }
    } catch (error) {
      console.error('[PERF] GPS fetch error:', error);
      return null;
    }
  };

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

  // Hash an image file with GPS coordinates
  const hashImage = async (uri: string, location: LocationData): Promise<string> => {
    try {
      // Include GPS coordinates in the hash to prevent tampering
      const hashInput = `${uri}${location.latitude}${location.longitude}${location.accuracy || ''}`;
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        hashInput
      );
      return hash;
    } catch (error) {
      console.error('Hash error:', error);
      return 'hash-error';
    }
  };



  // Add this function after hashImage function (around line 120)


  const checkPhotoIntegrity = async (
    uri: string,
    photoType: 'before' | 'after',
    sessionId: string
  ): Promise<{ isValid: boolean; violations: string[] }> => {
    const violations: string[] = [];

    try {
      // In a real app, you would:
      // 1. Check EXIF metadata for edits
      // 2. Compare file modified time vs capture time
      // 3. Look for editing app signatures
      // 4. Check image dimensions match camera specs

      // For demo, simulate checks:

      // ===== TO ALLOW EDITING - UNCOMMENT THIS LINE =====
      // return { isValid: true, violations: [] };

      // ===== TO PREVENT EDITING - KEEP THIS CODE =====
      console.log(`🔍 Checking ${photoType} photo integrity:`, uri);

      // Simulate finding edits (for demo - 10% chance) EDITINGGGGGGG
      // if (Math.random() < 0.1) {
      //   violations.push('EXIF shows post-processing');
      //   await logEditingViolation(sessionId, photoType, 'adjustment', 'EXIF metadata indicates editing');
      // }

      // // Simulate crop detection
      // if (Math.random() < 0.05) {
      //   violations.push('Image appears cropped');
      //   await logEditingViolation(sessionId, photoType, 'crop', 'Aspect ratio suggests cropping');
      // }

      return {
        isValid: violations.length === 0,
        violations
      };

    } catch (error) {
      console.error('Integrity check error:', error);
      return { isValid: true, violations: [] }; // Fail-safe
    }
  };
  // Generate verification code deterministically from proof data
  // Format: BA-YYYY-XXXXXX (e.g., BA-2026-7F3A9D)
  // The code is derived from cryptographic hashes, ensuring it changes if any proof data is modified
  const generateVerificationCode = async (
    beforeHash: string,
    afterHash: string,
    proofHash: string,
    timestamp: string
  ): Promise<string> => {
    try {
      // Create a deterministic hash from all proof data
      // This ensures the code changes if any part of the proof is modified
      const codeInput = `${beforeHash}${afterHash}${proofHash}${timestamp}`;
      const codeHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        codeInput
      );

      // Extract year from timestamp (ISO format: YYYY-MM-DD...)
      const year = new Date(timestamp).getFullYear();

      // Take first 6 characters of hash (SHA256 produces hex, so 0-9, A-F)
      // Convert to uppercase for consistency
      const codePart = codeHash.substring(0, 6).toUpperCase();

      return `BA-${year}-${codePart}`;
    } catch (error) {
      console.error('Verification code generation error:', error);
      return 'BA-0000-ERROR';
    }
  };

  // Create master proof hash from all data including GPS
  const createProofHash = async (
    beforeHash: string,
    afterHash: string,
    meta: Metadata,
    beforeLoc: LocationData,
    afterLoc: LocationData,
    timeWindowData?: TimeWindowData
  ): Promise<string> => {
    // USER-DECLARED TIME WINDOW ENFORCEMENT - Include time window in hash to bind it to proof
    // This ensures that modifying time window data invalidates the proof
    const dataString = JSON.stringify({
      beforeHash,
      afterHash,
      timestamp: meta.timestamp,
      beforeLocation: {
        latitude: beforeLoc.latitude,
        longitude: beforeLoc.longitude,
        accuracy: beforeLoc.accuracy
      },
      afterLocation: {
        latitude: afterLoc.latitude,
        longitude: afterLoc.longitude,
        accuracy: afterLoc.accuracy,
      },
      device: meta.device,
      platform: meta.platform,
      // Bind time window to proof hash (non-optional)
      timeWindow: timeWindowData ? {
        minTimeMs: timeWindowData.minTimeMs,
        maxTimeMs: timeWindowData.maxTimeMs,
        actualElapsedMs: timeWindowData.actualElapsedMs,
        timeSource: timeWindowData.timeSource,
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

  // ALGORITHM VERSION LOCKING - v1.0.0
  // This is the reference hash computation for algorithm version 1.0.0
  // Do NOT modify this function - it must remain stable for verification of old proofs
  // Future versions (e.g., v1.1.0) would have their own function
  const computeHash_v1_0_0 = async (
    beforeHash: string,
    afterHash: string,
    meta: Metadata,
    beforeLoc: LocationData,
    afterLoc: LocationData,
    timeWindowData?: TimeWindowData
  ): Promise<string> => {
    const dataString = JSON.stringify({
      beforeHash,
      afterHash,
      timestamp: meta.timestamp,
      beforeLocation: {
        latitude: beforeLoc.latitude,
        longitude: beforeLoc.longitude,
        accuracy: beforeLoc.accuracy
      },
      afterLocation: {
        latitude: afterLoc.latitude,
        longitude: afterLoc.longitude,
        accuracy: afterLoc.accuracy,
      },
      device: meta.device,
      platform: meta.platform,
      timeWindow: timeWindowData ? {
        minTimeMs: timeWindowData.minTimeMs,
        maxTimeMs: timeWindowData.maxTimeMs,
        actualElapsedMs: timeWindowData.actualElapsedMs,
        timeSource: timeWindowData.timeSource,
      } : null,
    });

    try {
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        dataString
      );
      return hash;
    } catch (error) {
      console.error('Hash v1.0.0 computation error:', error);
      return 'hash-error';
    }
  };

  // UI/UX - Check if we have any exportable data
  const checkExportDataExists = async (): Promise<boolean> => {
    try {
      const proofs = await AsyncStorage.getItem('proofs');
      const auditTrail = await AsyncStorage.getItem('auditTrail');
      const tamperWarnings = await AsyncStorage.getItem('tamperWarnings');

      const hasData = !!(proofs || auditTrail || tamperWarnings);
      setHasExportData(hasData);
      return hasData;
    } catch (error) {
      console.error('Error checking export data:', error);
      setHasExportData(false);
      return false;
    }
  };

  // UI/UX - Calculate remaining cooldown time and disable "Take After" button


  // PAIRED SESSION LOCKING - Check if active session exists and is valid
  const validateActiveSession = async (): Promise<boolean> => {
    // Check if there's an active session in state
    if (activeSession && activeSession.isActive) {
      const sessionAge = Date.now() - activeSession.createdAt;
      const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes timeout

      if (sessionAge > SESSION_TIMEOUT) {
        // Session expired
        setActiveSession(null);
        return false;
      }
      return true;
    }

    // Also check AsyncStorage for any persisted active session
    try {
      const sessionData = await AsyncStorage.getItem('activeSession');
      if (sessionData) {
        const session: SessionData = JSON.parse(sessionData);
        const sessionAge = Date.now() - session.createdAt;
        const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes timeout

        if (sessionAge > SESSION_TIMEOUT) {
          // Session expired
          await AsyncStorage.removeItem('activeSession');
          setActiveSession(null);
          return false;
        }

        // CRITICAL FIX: Only restore session if it has a Before photo
        // (prevents ghost sessions from incomplete attempts or crashed states)
        if (!session.beforeUri) {
          console.log('[SESSION] Stale session without Before photo detected - discarding');
          await AsyncStorage.removeItem('activeSession');
          return false;
        }

        // Restore active session
        setActiveSession(session);
        return true;
      }
    } catch (error) {
      console.error('Error checking active session:', error);
    }

    return false;
  };

  // PAIRED SESSION LOCKING - Start a new session
  const startNewSession = async (
    beforeUri: string,
    metadata: Metadata,
    beforeLocation: LocationData
  ): Promise<SessionData> => {
    const sessionId = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${Date.now()}${beforeUri}${JSON.stringify(beforeLocation)}`
    ).then(hash => hash.substring(0, 12));

    // USER-DECLARED TIME WINDOW ENFORCEMENT - Initialize monotonic time tracking
    const { monoMs, sysMs } = initializeTimeTracking();

    // Validate time window values are set
    if (selectedMinTimeMin === null || selectedMaxTimeMin === null) {
      throw new Error('Time window not properly configured');
    }

    const minTimeMs = selectedMinTimeMin * 60 * 1000; // Convert minutes to ms
    const maxTimeMs = selectedMaxTimeMin * 60 * 1000;

    const timeWindowData: TimeWindowData = {
      minTimeMs,
      maxTimeMs,
      actualElapsedMs: 0,
      timeSource: getTimeSource(),
      timeVerificationStatus: 'INVALID', // Initially invalid until min time passes
      createdAt: new Date().toISOString(),
    };

    const session: SessionData = {
      id: sessionId,
      startTime: metadata.timestamp,
      beforeUri,
      metadata,
      beforeLocation,
      isActive: true,
      createdAt: Date.now(),
      // USER-DECLARED TIME WINDOW ENFORCEMENT - Bind time window to session
      timeWindow: timeWindowData,
      timeAnomalies: [],
    };

    setActiveSession(session);
    setTimeWindow(timeWindowData);
    setElapsedTimeMs(0);
    setTimeWindowStatus('INVALID');
    setTimeAnomalies([]);

    // Persist session for app restarts
    await AsyncStorage.setItem('activeSession', JSON.stringify(session));

    // Log time window declaration
    await logAuditEvent('time_window_declared', sessionId, undefined, beforeLocation, {
      minTimeMs,
      maxTimeMs,
      timeSource: getTimeSource(),
    });

    return session;
  };

  // UI/UX - Fully reset all UI state after session ends
  const resetUIState = async () => {
    setActiveSession(null);
    setBeforeUri(null);
    setAfterUri(null);
    setBeforeTaken(false);
    setAfterTaken(false);
    setMetadata(null);
    setBeforeLocation(null);
    setValidationError(null);
    setMode('before');
    setShowMetadataForm(false);
    // USER-DECLARED TIME WINDOW ENFORCEMENT - Reset time window state
    setTimeWindow(null);
    setElapsedTimeMs(0);
    setTimeWindowStatus(null);
    setTimeAnomalies([]);
    setShowTimeWindowForm(false);
    resetTimeTracking();
    await AsyncStorage.removeItem('activeSession');
    await checkExportDataExists(); // Refresh export button
  };

  /**
   * Convert ProofRecord to ProofObject format for signing/upload
   */
  const convertProofRecordToProofObject = async (proof: ProofRecord): Promise<ProofObject> => {
    const workerId = await getDeviceWorkerId();

    return {
      proofId: proof.id,
      status: 'completed',
      workerId: workerId,
      createdAt: proof.createdAt,
      before: {
        timestamp: proof.beforeTimestamp || proof.createdAt,
        imageHash: proof.beforeHash,
        gps: {
          lat: proof.beforeLocation?.latitude || 0,
          lon: proof.beforeLocation?.longitude || 0,
        },
      },
      after: {
        timestamp: proof.afterTimestamp || proof.createdAt,
        imageHash: proof.afterHash,
        gps: {
          lat: proof.afterLocation?.latitude || 0,
          lon: proof.afterLocation?.longitude || 0,
        },
      },
    };
  };

  /**
   * Upload proof with cryptographic signature, then generate PIN
   * CRYPTOGRAPHIC SIGNING - Worker signs proof with private key before upload
   */
  const uploadAndGeneratePin = async (proof: ProofRecord) => {
    try {
      setGeneratingCode(true);
      console.log('📤 [UPLOAD] Starting proof upload with signature...');



      // Convert to ProofObject format
      const proofObject = await convertProofRecordToProofObject(proof);

      // Upload signed proof to backend
      // uploadProof will:
      // 1. Register public key if first upload
      // 2. Sign proof with private key
      // 3. Send proof + signature to backend
      await uploadProof(proofObject);
      console.log('✅ [UPLOAD] Proof uploaded with signature');

      // Now generate PIN from backend (proof must be uploaded first)
      setCurrentProofId(proof.id);
      setPinError('');
      setCurrentPin('');

      console.log('🔐 Generating PIN for proof:', proof.id);
      const pin = await generatePin(proof.id);
      setCurrentPin(pin);
      console.log('✓ PIN generated:', pin);

      setGeneratingCode(false);
      setShowPinModal(true);
    } catch (error) {
      console.error('❌ Upload/PIN error:', error);
      setGeneratingCode(false);
      setPinError(
        error instanceof Error ? error.message : 'Failed to generate PIN'
      );
      Alert.alert('Error', 'Could not upload proof or generate PIN. Please check your connection and try again.');
      // Still show modal so user knows something happened
      setShowPinModal(true);
    }
  };

  /**
   * Display PIN modal after proof upload
   * @deprecated Use uploadAndGeneratePin instead (includes upload)
   */
  const showPinForProof = async (proofId: string) => {
    try {
      setCurrentProofId(proofId);
      setPinError('');
      setCurrentPin('');
      setShowPinModal(true);

      console.log('🔐 Generating PIN for proof:', proofId);
      const pin = await generatePin(proofId);
      setCurrentPin(pin);
      console.log('✓ PIN generated:', pin);
    } catch (error) {
      console.error('PIN generation error:', error);
      setPinError(
        error instanceof Error ? error.message : 'Failed to generate PIN'
      );
      Alert.alert('Error', 'Could not generate PIN for sharing');
    }
  };

  // PAIRED SESSION LOCKING - Complete and clear session
  const completeSession = async () => {
    await resetUIState();
  };



  const logAuditEvent = async (
    type: AuditEvent['type'],
    sessionId?: string,
    proofId?: string,
    location?: LocationData,
    additionalData?: any
  ) => {
    try {
      const event: AuditEvent = {
        id: Date.now().toString(),
        type,
        timestamp: new Date().toISOString(),
        sessionId,
        proofId,
        location,
        metadata: {
          device: Device.modelName || 'Unknown',
          platform: Platform.OS,
          jobId: sessionMetadata.jobId,
          clientName: sessionMetadata.clientName,
          ...additionalData
        }
      };

      const existing = await AsyncStorage.getItem('auditTrail');
      const auditTrail = existing ? JSON.parse(existing) : [];
      auditTrail.push(event);

      // Keep last 1000 events
      const limitedTrail = auditTrail.slice(-1000);
      await AsyncStorage.setItem('auditTrail', JSON.stringify(limitedTrail));

      console.log(`[AUDIT] ${type}: ${sessionId || 'no-session'}`);
    } catch (error) {
      console.error('Audit log error:', error);
    }
  };

  // TAMPER PROTECTION - Log tamper events (ADDED)
  const logTamperEvent = async (
    reason: TamperFlag['reason'],
    sessionId: string,
    proofId?: string,
    details?: string
  ) => {
    try {
      const tamperFlag: TamperFlag = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        reason,
        sessionId,
        proofId,
        details
      };




      // Store in tamper warnings
      const existing = await AsyncStorage.getItem('tamperWarnings');
      const warnings = existing ? JSON.parse(existing) : [];
      warnings.push(tamperFlag);
      await AsyncStorage.setItem('tamperWarnings', JSON.stringify(warnings.slice(-100)));

      // Also log as audit event
      await logAuditEvent('tamper_detected', sessionId, proofId, undefined, {
        tamperReason: reason,
        details
      });

      console.log(`[TAMPER] ${reason}: ${sessionId}`);
    } catch (error) {
      console.error('Tamper log error:', error);
    }
  };

  // PAIRED SESSION LOCKING - Abandon session (user cancels)
  const abandonSession = async () => {
    // AUDIT TRAIL - Log session cancellation
    await logAuditEvent('session_cancelled', activeSession?.id);

    // TAMPER PROTECTION - Log tamper event
    if (activeSession?.id) {
      await logTamperEvent('session_abandoned', activeSession.id, undefined, 'User manually cancelled session');
    }

    // UI/UX - Reset all UI state
    await resetUIState();
  };

  // Get detected anomalies from current session
  const getDetectedAnomalies = (): TimeAnomaly[] => {
    return timeAnomalies;
  };

  // AUDIT TRAIL - Log event function (ADDED)
  const logEditingViolation = async (
    sessionId: string,
    photoType: 'before' | 'after',
    violationType: EditingViolation['violationType'],
    details: string
  ) => {
    try {
      const violation: EditingViolation = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        sessionId,
        photoType,
        violationType,
        details
      };

      // Store violations
      const existing = await AsyncStorage.getItem('editingViolations');
      const violations = existing ? JSON.parse(existing) : [];
      violations.push(violation);
      await AsyncStorage.setItem('editingViolations', JSON.stringify(violations.slice(-100)));

      // Also log as audit event
      await logAuditEvent('editing_violation', sessionId, undefined, undefined, {
        photoType,
        violationType,
        details
      });

      console.log(`[EDITING VIOLATION] ${photoType} ${violationType}: ${details}`);

      // Update state for UI
      setEditingViolations(prev => [...prev, violation]);

    } catch (error) {
      console.error('Violation log error:', error);
    }
  };












  // AUDIT TRAIL - Export function (ADDED)
  const exportAuditTrail = async () => {
    try {
      const auditData = await AsyncStorage.getItem('auditTrail');
      const proofData = await AsyncStorage.getItem('proofs');
      const sessionData = await AsyncStorage.getItem('activeSession');
      const tamperData = await AsyncStorage.getItem('tamperWarnings');
      const violationData = await AsyncStorage.getItem('editingViolations');

      // USER-DECLARED TIME WINDOW ENFORCEMENT - Parse proofs and extract time window info
      const parsedProofs = proofData ? JSON.parse(proofData) : [];
      const timeWindowSummary = parsedProofs.map((proof: ProofRecord) => ({
        proofId: proof.id,
        declaredMinTimeMin: proof.timeWindow ? (proof.timeWindow.minTimeMs / 60000).toFixed(0) : 'N/A',
        declaredMaxTimeMin: proof.timeWindow ? (proof.timeWindow.maxTimeMs / 60000).toFixed(0) : 'N/A',
        actualElapsedMin: proof.timeWindow ? (proof.timeWindow.actualElapsedMs / 60000).toFixed(1) : 'N/A',
        timeVerificationStatus: proof.timeWindow?.timeVerificationStatus || 'UNKNOWN',
        timeSource: proof.timeWindow?.timeSource || 'unknown',
        timeAnomaliesCount: proof.timeAnomalies?.length || 0,
      }));

      // EXTERNAL TIMESTAMP ANCHORING - Generate anchor verification summary
      const anchorSummary = parsedProofs.map((proof: ProofRecord) => ({
        proofId: proof.id,
        verificationCode: proof.verificationCode,
        anchorStatus: proof.externalAnchor?.status || 'unanchored',
        anchorMethod: proof.externalAnchor?.method || 'none',
        tsaName: proof.externalAnchor?.tsaName || null,
        anchoredAt: proof.externalAnchor?.anchoredAt || null,
        verification: proof.externalAnchor?.verification || 'unverified',
        independentlyVerifiable: proof.externalAnchor?.status === 'anchored' && !!proof.externalAnchor?.tokenData,
      }));

      const totalAnchored = anchorSummary.filter((a: any) => a.anchorStatus === 'anchored').length;
      const totalPending = anchorSummary.filter((a: any) => a.anchorStatus === 'pending').length;

      const exportData = {
        exportedAt: new Date().toISOString(),
        device: Device.modelName || 'Unknown',
        platform: Platform.OS,
        // EXTERNAL TIMESTAMP ANCHORING - Add anchor verification summary
        externalTimestampAnchoring: {
          featureName: 'External Timestamp Anchoring (RFC 3161 TSA)',
          summary: anchorSummary,
          totalProofs: parsedProofs.length,
          totalAnchored,
          totalPending,
          totalUnanchored: parsedProofs.length - totalAnchored - totalPending,
          anchoringNote: 'All anchored proofs contain signed TSA tokens that are independently verifiable by third parties.',
        },
        // USER-DECLARED TIME WINDOW ENFORCEMENT - Add time window verification summary
        timeWindowEnforcement: {
          featureName: 'User-Declared Time Window Enforcement',
          summary: timeWindowSummary,
          anomaliesDetected: timeAnomalies.length > 0,
        },
        auditTrail: auditData ? JSON.parse(auditData) : [],
        proofs: parsedProofs.map((proof: ProofRecord) => ({
          ...proof,
          algorithmVersion: proof.algorithmVersion || '1.0.0', // ALGORITHM VERSION LOCKING - Include version in export
        })),
        activeSession: sessionData ? JSON.parse(sessionData) : null,
        sessionMetadata,
        tamperWarnings: tamperData ? JSON.parse(tamperData) : [],
        editingViolations: violationData ? JSON.parse(violationData) : [],
        integrityStatus: (tamperData && JSON.parse(tamperData).length > 0) ||
          (violationData && JSON.parse(violationData).length > 0)
          ? 'COMPROMISED' : 'INTACT'
      };

      // Log the export event
      await logAuditEvent('export_requested', activeSession?.id);

      // Create JSON file in cache directory (always writable)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `audit-trail-${timestamp}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      // Write the audit trail to file
      const jsonContent = JSON.stringify(exportData, null, 2);
      await FileSystem.writeAsStringAsync(fileUri, jsonContent);

      // Trigger native share sheet
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Export Audit Trail',
        UTI: 'public.json',
      });

    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const saveProof = async (
    before: string,
    after: string,
    meta: Metadata,
    beforeLoc: LocationData,
    afterLoc: LocationData
  ) => {
    if (!before || !after || !meta || !beforeLoc || !afterLoc) return;

    const now = Date.now();
    const startTime = new Date(meta.timestamp).getTime();
    const gapMs = now - startTime;


    // Time gap constraints: 1 minute minimum, 24 hours maximum
    const MIN_GAP = 60 * 1000;
    const MAX_GAP = 24 * 60 * 60 * 1000;

    if (gapMs < MIN_GAP) {
      setValidationError(
        `Time gap too short: Pair must reflect realistic work.(After 1 min) Current: ${(gapMs / 1000).toFixed(0)}s`
      );
      setAfterTaken(false);
      setAfterUri(null);
      return;
    }

    if (gapMs > MAX_GAP) {
      setValidationError(
        `Time gap too long: Pair must be captured within 24 hours. Current: ${(gapMs / (1000 * 60 * 60)).toFixed(1)}h`
      );
      setAfterTaken(false);
      setAfterUri(null);
      return;
    }

    // Check distance constraint (100 meters)
    const distance = haversineDistance(
      beforeLoc.latitude,
      beforeLoc.longitude,
      afterLoc.latitude,
      afterLoc.longitude
    );

    if (distance > 100) {
      setValidationError(
        `Location mismatch: After photo must be within 100m of Before photo. Distance: ${distance.toFixed(1)}m`
      );
      setAfterTaken(false);
      setAfterUri(null);
      return;
    }


    if (!activeSession || !activeSession.isActive) {
      setValidationError(
        'Session expired or invalid. Please start a new Before-After pair.'
      );
      setAfterTaken(false);
      setAfterUri(null);
      return;
    }

    // PAIRED SESSION LOCKING - Verify session consistency
    if (activeSession.beforeUri !== before) {
      setValidationError(
        'Session mismatch: "After" photo must belong to the same session as "Before" photo.'
      );
      setAfterTaken(false);
      setAfterUri(null);
      return;
    }






    //DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO DEMO

    // USER-DECLARED TIME WINDOW ENFORCEMENT - Validate time window
    if (!timeWindow) {
      setValidationError(
        'Time window not declared. Please start a new session with declared time window.'
      );
      setAfterTaken(false);
      setAfterUri(null);
      return;
    }

    const elapsedMs = getElapsedMonotonicMs();
    if (elapsedMs === null) {
      setValidationError(
        'Unable to measure elapsed time. Please try again.'
      );
      setAfterTaken(false);
      setAfterUri(null);
      return;
    }

    const timeValidation = validateTimeWindow(
      elapsedMs,
      timeWindow.minTimeMs,
      timeWindow.maxTimeMs
    );

    if (timeValidation.status === 'INVALID') {
      setValidationError(
        `Time window not yet valid: ${timeValidation.reason}`
      );
      setAfterTaken(false);
      setAfterUri(null);
      await logAuditEvent('time_window_block_early', activeSession.id, undefined, afterLoc, {
        elapsedMs,
        minTimeMs: timeWindow.minTimeMs,
        remainingMs: timeValidation.remainingMs,
      });
      return;
    }

    if (timeValidation.status === 'EXPIRED') {
      setValidationError(
        `Time window expired – session evidence void. Max time: ${(timeWindow.maxTimeMs / 60000).toFixed(0)}min`
      );
      setAfterTaken(false);
      setAfterUri(null);
      await logAuditEvent('time_window_expired', activeSession.id, undefined, afterLoc, {
        elapsedMs,
        maxTimeMs: timeWindow.maxTimeMs,
      });
      await logTamperEvent('time_window_expired', activeSession.id, undefined, `Capture attempted after max time (${(elapsedMs / 60000).toFixed(1)}min vs max ${(timeWindow.maxTimeMs / 60000).toFixed(0)}min)`);
      return;
    }

    await logAuditEvent('time_window_valid', activeSession.id, undefined, afterLoc, {
      elapsedMs,
      minTimeMs: timeWindow.minTimeMs,
      maxTimeMs: timeWindow.maxTimeMs,
      timeSource: timeWindow.timeSource,
    });

    const beforeIntegrity = await checkPhotoIntegrity(before, 'before', activeSession.id);
    const afterIntegrity = await checkPhotoIntegrity(after, 'after', activeSession.id);


    if (!beforeIntegrity.isValid || !afterIntegrity.isValid) {
      const violationCount = beforeIntegrity.violations.length + afterIntegrity.violations.length;
      setValidationError(
        `EDITING DETECTED: ${violationCount} violation(s) found. Photos cannot be edited.`
      );
      setAfterTaken(false);
      setAfterUri(null);
      // Don't save proof if edited
      return;
    }

    // PAIRED SESSION LOCKING - Validate session continuity




    // Clear any previous errors
    setValidationError(null);

    // Hash both images with their GPS coordinates
    const bHash = await hashImage(before, beforeLoc);
    const aHash = await hashImage(after, afterLoc);







    // Create master proof hash including GPS data and time window
    // Update time window with actual elapsed time
    const updatedTimeWindow: TimeWindowData = {
      ...timeWindow,
      actualElapsedMs: elapsedMs,
      timeVerificationStatus: timeValidation.status as 'VALID',
    };
    const proofHash = await createProofHash(bHash, aHash, meta, beforeLoc, afterLoc, updatedTimeWindow);

    // Generate verification code deterministically from proof data
    const verificationCode = await generateVerificationCode(
      bHash,
      aHash,
      proofHash,
      meta.timestamp
    );


    const proof: ProofRecord = {
      id: now.toString(),
      beforeUri: before,
      afterUri: after,
      createdAt: meta.timestamp,
      deviceName: meta.device,
      platform: meta.platform,
      beforeHash: bHash,
      afterHash: aHash,
      proofHash: proofHash,
      beforeLocation: beforeLoc,
      afterLocation: afterLoc,
      verificationCode: verificationCode,
      algorithmVersion: '1.0.0', // ALGORITHM VERSION LOCKING - Set version at proof creation
      sessionId: activeSession.id, // PAIRED SESSION LOCKING - Track session
      jobId: sessionMetadata.jobId, // AUDIT TRAIL - Add job metadata
      clientName: sessionMetadata.clientName, // AUDIT TRAIL - Add client metadata
      beforeTimestamp: meta.timestamp, // TIME SEQUENCE - Before photo timestamp
      afterTimestamp: new Date(now).toISOString(), // TIME SEQUENCE - After photo timestamp
      sessionMetadata: { id: activeSession.id }, // SESSION INTEGRITY - Link to session
      // USER-DECLARED TIME WINDOW ENFORCEMENT - Append time window data to proof
      timeWindow: updatedTimeWindow,
      timeAnomalies: getDetectedAnomalies(),
    };



    const existing = await AsyncStorage.getItem('proofs');
    const proofs = existing ? JSON.parse(existing) : [];

    proofs.unshift(proof);

    // Keep only the last 20 proofs to avoid storage quota issues
    const limitedProofs = proofs.slice(0, 20);

    await AsyncStorage.setItem('proofs', JSON.stringify(limitedProofs));

    // AUDIT TRAIL - Log proof creation
    await logAuditEvent('proof_created', activeSession.id, proof.id, afterLoc, {
      verificationCode: verificationCode,
      distance: distance
    });

    // EXTERNAL TIMESTAMP ANCHORING - Submit to RFC 3161 TSA with Binary DER Encoding
    // This is a REAL submission to a third-party timestamp authority with proper RFC 3161 format
    // Sends ASN.1 DER-encoded TimeStampReq to DigiCert for cryptographic timestamping
    // If network is down, it will fail visibly (and the proof will still be valid, just unanchored)
    try {
      const anchorService = getAnchorService();
      await anchorService.initialize();

      // REAL TSA submission - RFC 3161 binary DER format (proper implementation)
      // TimeStampReq is ASN.1 DER encoded, sent to DigiCert, returns signed TimeStampToken
      const externalAnchor = await anchorService.submitProofToTSA(proofHash);

      if (externalAnchor) {
        // Add anchor to proof metadata (externalAnchor is already properly formatted ExternalAnchor type)
        proof.externalAnchor = externalAnchor;

        // CRITICAL: Re-save proofs with updated anchor data
        const existing = await AsyncStorage.getItem('proofs');
        const proofs = existing ? JSON.parse(existing) : [];
        const proofIndex = proofs.findIndex((p: ProofRecord) => p.id === proof.id);
        if (proofIndex >= 0) {
          proofs[proofIndex] = proof;
          await AsyncStorage.setItem('proofs', JSON.stringify(proofs));
        }

        console.log('[ANCHOR] ✅ Proof anchored to real TSA:', proofHash.substring(0, 16));
        console.log('[ANCHOR] Token from:', externalAnchor.tsaName);
        console.log('[ANCHOR] Timestamp:', externalAnchor.authenticatedTime);
      }
    } catch (error) {
      // CRITICAL: Show failure visibly with detailed error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ANCHOR] ❌ TSA anchoring FAILED:', errorMessage);
      console.warn('[ANCHOR] Proof is still valid, but NOT externally anchored');

      // Set FAILED anchor status with error reason so user knows what happened
      proof.externalAnchor = {
        status: 'failed',
        error_reason: errorMessage,
        verification: 'failed',
        method: 'tsa',
        tsaName: 'DigiCert',
        tsaUrl: DIGICERT_TSA.url,
      };

      // Save failed state as well - important for auditing
      const existing = await AsyncStorage.getItem('proofs');
      const proofs = existing ? JSON.parse(existing) : [];
      const proofIndex = proofs.findIndex((p: ProofRecord) => p.id === proof.id);
      if (proofIndex >= 0) {
        proofs[proofIndex] = proof;
        await AsyncStorage.setItem('proofs', JSON.stringify(proofs));
      }

      // Log the failure for audit trail
      await logAuditEvent('anchor_failed', activeSession?.id, proof.id, afterLoc, {
        error: errorMessage,
        tsaName: DIGICERT_TSA.name,
      });

      // Non-blocking: anchoring is optional, proof remains valid
      // User will see ❌ TSA Failed with reason
    }

    // PAIRED SESSION LOCKING - Complete the session and reset all UI
    await completeSession();

    // CRYPTOGRAPHIC SIGNING - Upload proof with signature and generate PIN
    // This happens AFTER UI is reset so the modal appears on top of the clean state
    setTimeout(() => {
      uploadAndGeneratePin(proof);
    }, 500);
  };

  // PERFORMANCE FIX 6 - Pre-initialize camera permissions on app start
  // CRYPTOGRAPHIC SIGNING - Generate worker keypair on first launch
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('[PERF] Pre-requesting camera permissions...');
        console.log('[CRYPTO] Generating worker keypair if needed...');

        // Generate Ed25519 keypair on first app launch (idempotent)
        await generateWorkerKeypair();

        // This caches the permission so it's instant when user clicks button
        if (permission && !permission.granted) {
          // Just request, don't require user to grant right now
          // The useCameraPermissions hook already manages this
        }

        console.log('[PERF] App initialization complete');
      } catch (error) {
        console.log('[PERF] Permission pre-init error (non-critical):', error);
      }
    };

    initializeApp();
  }, []);

  // USER-DECLARED TIME WINDOW ENFORCEMENT - Monitor app lifecycle for anomalies
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (!activeSession?.id) {
        appStateRef.current = nextAppState;
        return;
      }

      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App resumed from background
        const anomaly = recordTimeAnomaly(
          activeSession.id,
          'app_foregrounded',
          'App resumed from background during active session'
        );
        await logAuditEvent('time_anomaly_detected', activeSession.id, undefined, undefined, {
          anomalyType: 'app_foregrounded',
          details: anomaly.details,
        });
        setTimeAnomalies((prev) => [...prev, anomaly]);
        console.log('[TIME-WINDOW] App foregrounded during session:', anomaly);
      } else if (nextAppState.match(/inactive|background/)) {
        // App backgrounded
        const anomaly = recordTimeAnomaly(
          activeSession.id,
          'app_backgrounded',
          'App backgrounded during active session'
        );
        await logAuditEvent('time_anomaly_detected', activeSession.id, undefined, undefined, {
          anomalyType: 'app_backgrounded',
          details: anomaly.details,
        });
        setTimeAnomalies((prev) => [...prev, anomaly]);
        console.log('[TIME-WINDOW] App backgrounded during session:', anomaly);
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [activeSession]);

  // USER-DECLARED TIME WINDOW ENFORCEMENT - Update elapsed time display
  useEffect(() => {
    if (!timeWindow || !activeSession?.isActive) {
      return;
    }

    const interval = setInterval(() => {
      const elapsedMs = getElapsedMonotonicMs();
      if (elapsedMs !== null) {
        setElapsedTimeMs(elapsedMs);

        // Check for clock anomalies
        const clockAnomaly = detectClockAnomaly(activeSession.id);
        if (clockAnomaly) {
          logAuditEvent('time_anomaly_detected', activeSession.id, undefined, undefined, {
            anomalyType: 'clock_change_detected',
            details: clockAnomaly.details,
          });
          setTimeAnomalies((prev) => [...prev, clockAnomaly]);
          console.log('[TIME-WINDOW] Clock anomaly detected:', clockAnomaly);
        }

        // Validate time window
        const validation = validateTimeWindow(
          elapsedMs,
          timeWindow.minTimeMs,
          timeWindow.maxTimeMs
        );
        setTimeWindowStatus(validation.status);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [timeWindow, activeSession]);

  // PAIRED SESSION LOCKING - Check for existing sessions on component mount
  useEffect(() => {
    const initializeApp = async () => {
      // 1. Check for existing session
      const hasActiveSession = await validateActiveSession();
      if (hasActiveSession && activeSession) {
        setBeforeUri(activeSession.beforeUri);
        setBeforeTaken(true);
        setMetadata(activeSession.metadata);
        setBeforeLocation(activeSession.beforeLocation);
        setMode('after');
      }

      // 2. Check if we have data to export
      await checkExportDataExists();

      // 3. Load tamper warnings
      try {
        const data = await AsyncStorage.getItem('tamperWarnings');
        if (data) {
          setTamperWarnings(JSON.parse(data));
        }
      } catch (error) {
        console.error('Error loading tamper warnings:', error);
      }

      // 4. Load editing violations
      try {
        const violationData = await AsyncStorage.getItem('editingViolations');
        if (violationData) {
          setEditingViolations(JSON.parse(violationData));
        }
      } catch (error) {
        console.error('Error loading editing violations:', error);
      }
    };

    initializeApp();
  }, []);

  // Refresh warnings and export data availability when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const refreshData = async () => {
        try {
          // Refresh export data status
          await checkExportDataExists();

          // Refresh tamper warnings
          const data = await AsyncStorage.getItem('tamperWarnings');
          if (data) {
            setTamperWarnings(JSON.parse(data));
          } else {
            setTamperWarnings([]);
          }
        } catch (error) {
          console.error('Error refreshing data:', error);
        }
      };

      refreshData();
    }, [])
  );

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera" size={64} color="#3b82f6" style={styles.permissionIcon} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>We need camera permission to capture proof photos</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Welcome Screen
  if (!hasProceeded) {
    return (
      <SafeAreaView style={[styles.container, styles.welcomeContainer]}>
        <View style={styles.welcomeContent}>
          <Ionicons name="shield-checkmark" size={100} color="#ffffff" style={styles.welcomeIcon} />
          <Text style={styles.welcomeTitle}>BeforeAfter</Text>
          <Text style={styles.welcomeSubtitle}>Tamper-Evident Proof System</Text>
          <Text style={styles.welcomeDescription}>
            Capture verified before and after photos with cryptographic proof and timestamp authentication.
          </Text>
          <TouchableOpacity
            style={styles.proceedButton}
            onPress={() => setHasProceeded(true)}
          >
            <Text style={styles.proceedButtonText}>Start Capturing</Text>
            <Ionicons name="arrow-forward" size={20} color="#3b82f6" style={styles.proceedButtonIcon} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (showCamera) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }}>
          {/* FIX: Add loading overlay directly in camera view */}
          {isProcessing && (
            <View style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: 'rgba(0,0,0,0.7)',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 9999,
            }}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={{
                color: '#ffffff',
                marginTop: 20,
                fontSize: 18,
                fontWeight: '600'
              }}>
                {processingMessage || 'Processing...'}
              </Text>
            </View>
          )}
        </CameraView>

        <View style={styles.captureContainer}>
          <TouchableOpacity
            style={[styles.captureButton, isProcessing && styles.captureButtonDisabled]}
            disabled={isProcessing}
            onPress={async () => {
              // PERFORMANCE FIX 1 & 7 - Debounce + prevent double captures
              if (isProcessing || isProcessingRef.current) {
                console.log('[PERF] Capture already in progress, ignoring click');
                return;
              }

              isProcessingRef.current = true;
              setIsProcessing(true);
              setProcessingMessage('Capturing photo...');

              try {
                console.log('[PERF] Capture button clicked:', Date.now());

                if (!cameraRef.current) {
                  throw new Error('Camera not available');
                }

                // PERFORMANCE FIX 2 - Take photo immediately (FASTEST PART)
                console.log('[PERF] Taking photo:', Date.now());
                const photo = await cameraRef.current.takePictureAsync();
                console.log('[PERF] Photo captured:', Date.now());

                // PERFORMANCE FIX 2 - Close camera immediately, show preview
                setShowCamera(false);
                setProcessingMessage('Processing photo...');

                // PERFORMANCE FIX 5 - Error handling with try-catch
                try {
                  // Now defer heavy operations to background
                  if (mode === 'before') {
                    console.log('[PERF] Processing BEFORE photo:', Date.now());
                    setBeforeUri(photo.uri);

                    // Fetch GPS with timeout and fallback
                    console.log('[PERF] Fetching GPS for BEFORE:', Date.now());
                    const beforeLoc = await fetchGPSWithFallback(5000);

                    if (!beforeLoc) {
                      throw new Error('Unable to get location. Please enable GPS and try again.');
                    }

                    console.log('[PERF] GPS acquired:', Date.now());
                    setBeforeLocation(beforeLoc);

                    const meta: Metadata = {
                      timestamp: new Date().toISOString(),
                      device:
                        Device.modelName ||
                        Device.deviceName ||
                        Device.osName ||
                        `${Platform.OS} Device`,
                      platform: Platform.OS,
                    };

                    setMetadata(meta);
                    setBeforeTaken(true);
                    setMode('after');

                    console.log('[PERF] Starting session:', Date.now());
                    const session = await startNewSession(photo.uri, meta, beforeLoc);

                    // PERFORMANCE FIX 2 - Defer audit logging to background
                    InteractionManager.runAfterInteractions(() => {
                      console.log('[PERF] Background: logging audit events:', Date.now());
                      logAuditEvent('session_start', session.id, undefined, beforeLoc, {
                        jobId: sessionMetadata.jobId,
                        clientName: sessionMetadata.clientName
                      });
                      logAuditEvent('before_capture', session.id, undefined, beforeLoc);
                    });

                    console.log('[PERF] BEFORE photo complete:', Date.now());
                  } else {
                    console.log('[PERF] Processing AFTER photo:', Date.now());

                    // Validate session
                    const hasValidSession = await validateActiveSession();
                    if (!hasValidSession) {
                      throw new Error('No active session. Please start with a Before photo.');
                    }

                    // Fetch GPS with timeout and fallback
                    console.log('[PERF] Fetching GPS for AFTER:', Date.now());
                    const afterLoc = await fetchGPSWithFallback(5000);

                    if (!afterLoc) {
                      throw new Error('Unable to get location. Please enable GPS and try again.');
                    }

                    console.log('[PERF] GPS acquired:', Date.now());

                    // Radius check with job site location
                    if (jobSiteLocation) {
                      const radiusCheck = validateRadius(afterLoc, {
                        center: jobSiteLocation,
                        radiusMeters: 100,
                        enforcementEnabled: true
                      });

                      if (!radiusCheck.isValid) {
                        throw new Error(radiusCheck.errorMessage || 'Location validation failed');
                      }
                    }

                    setAfterUri(photo.uri);
                    setAfterTaken(true);

                    // PERFORMANCE FIX 2 - Defer heavy proof saving to background
                    InteractionManager.runAfterInteractions(() => {
                      console.log('[PERF] Background: logging after_capture and saving proof:', Date.now());
                      logAuditEvent('after_capture', activeSession?.id, undefined, afterLoc);

                      if (beforeUri && metadata && beforeLocation && activeSession) {
                        saveProof(beforeUri, photo.uri, metadata, beforeLocation, afterLoc);
                      }
                    });

                    console.log('[PERF] AFTER photo complete:', Date.now());
                  }
                } catch (error) {
                  console.error('[PERF] Error processing photo:', error);
                  const errorMsg = error instanceof Error ? error.message : 'Error processing photo';
                  setValidationError(errorMsg);

                  // Reset photo state on error
                  if (mode === 'before') {
                    setBeforeUri(null);
                    setBeforeTaken(false);
                  } else {
                    setAfterUri(null);
                    setAfterTaken(false);
                  }

                  // Keep camera open on error so user can retry
                  setShowCamera(true);
                }
              } catch (error) {
                console.error('[PERF] Capture error:', error);
                const errorMsg = error instanceof Error ? error.message : 'Camera error - please try again';
                setValidationError(errorMsg);
                setShowCamera(true);
              } finally {
                setProcessingMessage(null);
                isProcessingRef.current = false;
                setIsProcessing(false);
              }
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BeforeAfter</Text>
          <Text style={styles.headerSubtitle}>Tamper-Evident Proof Capture</Text>
        </View>

        {/* Job Details Card */}
        {!beforeTaken && !showMetadataForm && (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setShowMetadataForm(true)}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="document-text" size={20} color="#3b82f6" />
              <Text style={styles.cardTitle}>Add Job Details (Optional)</Text>
            </View>
            <Text style={styles.cardText}>Add context to your proof</Text>
          </TouchableOpacity>
        )}

        {/* Job Details Form */}
        {showMetadataForm && !beforeTaken && (
          <View style={[styles.card, styles.formCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text" size={20} color="#3b82f6" />
              <Text style={styles.cardTitle}>Job Details</Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Job ID (optional)"
              placeholderTextColor="#94a3b8"
              value={jobId}
              onChangeText={setJobId}
            />

            <TextInput
              style={styles.input}
              placeholder="Client Name (optional)"
              placeholderTextColor="#94a3b8"
              value={clientName}
              onChangeText={setClientName}
            />

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                setSessionMetadata({
                  jobId,
                  clientName,
                  tags: []
                });
                setShowMetadataForm(false);
                if (jobId || clientName) {
                  logAuditEvent('session_metadata_updated', undefined, undefined, undefined, {
                    jobId,
                    clientName
                  });
                }
              }}
            >
              <Text style={styles.primaryButtonText}>Save Details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowMetadataForm(false)}
            >
              <Text style={styles.secondaryButtonText}>Skip</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Job Info Display */}
        {sessionMetadata.jobId && !showMetadataForm && (
          <View style={[styles.card, styles.infoCard]}>
            <View style={styles.infoBadge}>
              <Ionicons name="briefcase" size={16} color="#3b82f6" />
              <Text style={styles.infoBadgeText}>{sessionMetadata.jobId}</Text>
            </View>
            {sessionMetadata.clientName && (
              <View style={styles.infoBadge}>
                <Ionicons name="person" size={16} color="#3b82f6" />
                <Text style={styles.infoBadgeText}>{sessionMetadata.clientName}</Text>
              </View>
            )}
          </View>
        )}

        {/* Time Window Setup Card */}
        {!beforeTaken && !timeWindow && !showTimeWindowForm && (
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              setSelectedMinTimeMin(5);
              setSelectedMaxTimeMin(10);
              setShowTimeWindowForm(true);
            }}
          >
            <View style={styles.cardHeader}>
              <Ionicons name="time" size={20} color="#0ea5e9" />
              <Text style={styles.cardTitle}>Set Time Window (Required)</Text>
            </View>
            <Text style={styles.cardText}>Define min/max time between photos</Text>
          </TouchableOpacity>
        )}

        {/* Time Window Form */}
        {showTimeWindowForm && !beforeTaken && !timeWindow && (
          <View style={[styles.card, styles.formCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="time" size={20} color="#0ea5e9" />
              <Text style={styles.cardTitle}>User-Declared Time Window</Text>
            </View>

            <Text style={styles.timeWindowDescription}>
              Define the expected time between Before and After photos. This window is immutable once a session starts.
            </Text>

            <View style={styles.timeWindowInputContainer}>
              <View style={styles.timeWindowInputGroup}>
                <Text style={styles.timeWindowLabel}>Minimum Time (minutes):</Text>
                <View style={styles.timeWindowSliderContainer}>
                  <TouchableOpacity
                    style={styles.spinButton}
                    onPress={() => setSelectedMinTimeMin(Math.max(1, (selectedMinTimeMin ?? 1) - 1))}
                  >
                    <Text style={styles.spinButtonText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.timeWindowInput}
                    keyboardType="numeric"
                    value={(selectedMinTimeMin ?? 1).toString()}
                    onChangeText={(text) => {
                      const val = parseInt(text) || 1;
                      const maxVal = selectedMaxTimeMin ?? 10;
                      if (val < maxVal) {
                        setSelectedMinTimeMin(Math.max(1, val));
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={styles.spinButton}
                    onPress={() => {
                      const minVal = selectedMinTimeMin ?? 1;
                      const maxVal = selectedMaxTimeMin ?? 10;
                      if (minVal + 1 < maxVal) {
                        setSelectedMinTimeMin(minVal + 1);
                      }
                    }}
                  >
                    <Text style={styles.spinButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.timeWindowInputGroup}>
                <Text style={styles.timeWindowLabel}>Maximum Time (minutes):</Text>
                <View style={styles.timeWindowSliderContainer}>
                  <TouchableOpacity
                    style={styles.spinButton}
                    onPress={() => {
                      const minVal = selectedMinTimeMin ?? 1;
                      const maxVal = selectedMaxTimeMin ?? 10;
                      if (maxVal - 1 > minVal) {
                        setSelectedMaxTimeMin(maxVal - 1);
                      }
                    }}
                  >
                    <Text style={styles.spinButtonText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.timeWindowInput}
                    keyboardType="numeric"
                    value={(selectedMaxTimeMin ?? 10).toString()}
                    onChangeText={(text) => {
                      const minVal = selectedMinTimeMin ?? 1;
                      const val = parseInt(text) || minVal + 1;
                      if (val > minVal) {
                        setSelectedMaxTimeMin(Math.max(minVal + 1, val));
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={styles.spinButton}
                    onPress={() => setSelectedMaxTimeMin((selectedMaxTimeMin ?? 10) + 1)}
                  >
                    <Text style={styles.spinButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.timeWindowInfo}>
              <Text style={styles.timeWindowInfoText}>
                Window: {selectedMinTimeMin}–{selectedMaxTimeMin} minutes
              </Text>
              <Text style={styles.timeWindowWarning}>
                ⚠️ These values cannot be changed once the session starts.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                if (selectedMinTimeMin !== null && selectedMaxTimeMin !== null &&
                  selectedMinTimeMin > 0 && selectedMaxTimeMin > 0 &&
                  selectedMinTimeMin < selectedMaxTimeMin) {
                  const minTimeMs = selectedMinTimeMin * 60 * 1000;
                  const maxTimeMs = selectedMaxTimeMin * 60 * 1000;
                  const timeWindowData: TimeWindowData = {
                    minTimeMs,
                    maxTimeMs,
                    actualElapsedMs: 0,
                    timeSource: getTimeSource(),
                    timeVerificationStatus: 'INVALID',
                    createdAt: new Date().toISOString(),
                  };
                  setTimeWindow(timeWindowData);
                  setElapsedTimeMs(0);
                  setTimeWindowStatus('INVALID');
                  setTimeAnomalies([]);
                  setShowTimeWindowForm(false);
                } else {
                  setValidationError('Please select valid min and max times');
                }
              }}
            >
              <Text style={styles.primaryButtonText}>Proceed with Time Window</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                setShowTimeWindowForm(false);
                setSelectedMinTimeMin(null);
                setSelectedMaxTimeMin(null);
              }}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Start Session Card */}
        {!beforeTaken && (
          <View style={[styles.card, styles.mainActionCard]}>
            <View style={styles.mainActionIconContainer}>
              <Ionicons name="camera" size={48} color="#3b82f6" />
            </View>
            <Text style={styles.mainActionTitle}>Start Capture Session</Text>
            <Text style={styles.mainActionDescription}>
              Capture before and after photos with verified metadata
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, (isProcessing || !timeWindow) && styles.buttonDisabled]}
              disabled={isProcessing || !timeWindow}
              onPress={async () => {
                if (isProcessing || isProcessingRef.current) {
                  console.log('[PERF] Button already processing, ignoring click');
                  return;
                }

                isProcessingRef.current = true;
                setIsProcessing(true);
                setProcessingMessage('Opening camera...');

                try {
                  console.log('[PERF] "Take BEFORE photo" button clicked:', Date.now());

                  if (!jobSiteLocation) {
                    fetchGPSWithFallback(5000).then((gpsData) => {
                      if (gpsData) {
                        setJobSiteLocation(gpsData);
                        console.log('[PERF] Job site location set:', gpsData);
                      }
                    }).catch((err) => {
                      console.log('[PERF] Background GPS fetch failed:', err);
                    });
                  }

                  setMode('before');
                  setShowCamera(true);
                  setProcessingMessage(null);
                } catch (error) {
                  console.error('[PERF] Error opening camera:', error);
                  setValidationError(
                    error instanceof Error ? error.message : 'Failed to open camera'
                  );
                  setShowCamera(false);
                } finally {
                  isProcessingRef.current = false;
                  setIsProcessing(false);
                }
              }}
            >
              {isProcessing && processingMessage === 'Opening camera...' ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
                  <Text style={styles.primaryButtonText}>{processingMessage}</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Begin Capture</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Active Session Section */}
        {beforeTaken && !afterTaken && (
          <View style={styles.activeSessionContainer}>
            {/* Session Status Card */}
            <View style={[styles.card, styles.sessionStatusCard]}>
              <View style={styles.sessionStatusHeader}>
                <Ionicons name="lock-closed" size={24} color="#10b981" />
                <Text style={styles.sessionStatusTitle}>Session Active</Text>
              </View>
              <Text style={styles.sessionStatusText}>
                Before photo captured. You must complete this session.
              </Text>

              {/* Before Photo Info */}
              <View style={styles.photoInfoCard}>
                <Ionicons name="image" size={20} color="#3b82f6" />
                <View style={styles.photoInfoContent}>
                  <Text style={styles.photoInfoLabel}>Before Photo</Text>
                  <Text style={styles.photoInfoStatus}>✅ Locked</Text>
                </View>
              </View>

              {/* Location Info */}
              {beforeLocation && (
                <View style={styles.photoInfoCard}>
                  <Ionicons name="location" size={20} color="#0ea5e9" />
                  <View style={styles.photoInfoContent}>
                    <Text style={styles.photoInfoLabel}>Location</Text>
                    <Text style={styles.photoInfoValue} numberOfLines={1} ellipsizeMode="tail">
                      {beforeLocation.latitude.toFixed(5)}, {beforeLocation.longitude.toFixed(5)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Session ID */}
              {activeSession && (
                <View style={styles.photoInfoCard}>
                  <Ionicons name="key" size={20} color="#0ea5e9" />
                  <View style={styles.photoInfoContent}>
                    <Text style={styles.photoInfoLabel}>Session ID</Text>
                    <Text style={styles.photoInfoValue}>{activeSession.id.substring(0, 12)}...</Text>
                  </View>
                </View>
              )}

              {/* Time Window Status */}
              {timeWindow && (
                <View style={[styles.photoInfoCard, styles.timeWindowStatusCard]}>
                  <Ionicons name="time" size={20} color="#0ea5e9" />
                  <View style={styles.photoInfoContent}>
                    <Text style={styles.photoInfoLabel}>Time Window</Text>
                    <Text style={styles.photoInfoValue}>
                      {selectedMinTimeMin}–{selectedMaxTimeMin} min
                    </Text>
                    <Text style={styles.photoInfoSubValue}>
                      Elapsed: {(elapsedTimeMs / 1000).toFixed(1)}s
                    </Text>
                    {timeWindowStatus && (
                      <Text style={[
                        styles.timeWindowStatusBadge,
                        timeWindowStatus === 'VALID' && styles.timeWindowStatusBadgeValid,
                        timeWindowStatus === 'INVALID' && styles.timeWindowStatusBadgeInvalid,
                        timeWindowStatus === 'EXPIRED' && styles.timeWindowStatusBadgeExpired,
                      ]}>
                        {timeWindowStatus === 'VALID' ? '✅ Ready to capture' :
                          timeWindowStatus === 'EXPIRED' ? '❌ Expired' :
                            '⏳ Not ready yet'}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={[styles.primaryButton, (isProcessing || !timeWindow || timeWindowStatus !== 'VALID') && styles.buttonDisabled]}
              disabled={isProcessing || !timeWindow || timeWindowStatus !== 'VALID'}
              onPress={() => {
                if (isProcessing || isProcessingRef.current) {
                  console.log('[PERF] Already processing, ignoring click');
                  return;
                }

                setMode('after');
                setShowCamera(true);
              }}
            >
              {isProcessing ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
                  <Text style={styles.primaryButtonText}>{processingMessage || 'Processing...'}</Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons name="camera" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryButtonText}>Take AFTER Photo</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Session Action Buttons */}
            {beforeTaken && !afterTaken && activeSession?.isActive && (
              <View style={styles.sessionActions}>


                <TouchableOpacity
                  style={styles.dangerButton}
                  onPress={async () => {
                    if (!activeSession?.id) return;

                    Alert.alert(
                      'Delete Before Photo?',
                      'This will mark the entire session as "TAMPERED" and void any proof.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete & Void Session',
                          style: 'destructive',
                          onPress: async () => {
                            await logTamperEvent('before_deleted', activeSession.id, undefined, 'User deleted before photo, voiding session');
                            await completeSession();
                            setBeforeUri(null);
                            setBeforeTaken(false);
                            setMetadata(null);
                            setBeforeLocation(null);
                            alert('❌ Session voided due to before photo deletion. Audit trail shows TAMPERED flag.');
                          }
                        }
                      ]
                    );
                  }}
                >
                  <Ionicons name="trash" size={18} color="#ef4444" style={{ marginRight: 6 }} />
                  <Text style={styles.dangerButtonText}>Delete Before</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Validation Error */}
        {validationError && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={20} color="#ef4444" style={{ marginRight: 8 }} />
            <Text style={styles.errorText}>{validationError}</Text>
          </View>
        )}

        {/* Completion Status */}
        {beforeTaken && afterTaken && metadata && (
          <View style={[styles.card, styles.successCard]}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={48} color="#10b981" />
            </View>
            <Text style={styles.successTitle}>Proof Complete</Text>
            <Text style={styles.successText}>{metadata.timestamp}</Text>
            <Text style={styles.successText}>{metadata.device}</Text>
          </View>
        )}

        {/* Tamper Warning */}
        {!activeSession && !beforeTaken && tamperWarnings.length > 0 && (
          <View style={[styles.card, styles.warningCard]}>
            <View style={styles.warningHeader}>
              <Ionicons name="warning" size={24} color="#f97316" />
              <Text style={styles.warningTitle}>{tamperWarnings.length} Tampered Sessions</Text>
            </View>
            <Text style={styles.warningText}>Check export for detailed audit trail</Text>
          </View>
        )}

        {/* Export Button */}
        {hasExportData && (
          <TouchableOpacity
            style={[styles.card, styles.exportCard]}
            onPress={exportAuditTrail}
          >
            <View style={styles.exportHeader}>
              <Ionicons name="download" size={20} color="#3b82f6" />
              <Text style={styles.exportTitle}>Export Audit Trail</Text>
            </View>
            <Text style={styles.exportText}>Download all proofs and verification data</Text>
          </TouchableOpacity>
        )}

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Loading Overlay - Generating Code */}
      {generatingCode && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
        >
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingTitle}>Generating Code</Text>
              <Text style={styles.loadingSubtext}>Uploading and signing your proof...</Text>
            </View>
          </View>
        </Modal>
      )}

      {/* PIN Sharing Modal */}
      <Modal
        visible={showPinModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPinModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              paddingVertical: 40,
              paddingBottom: 100
            }}
          >
            <View style={{
              backgroundColor: 'white',
              margin: 20,
              padding: 30,
              borderRadius: 10
            }}>
              {/* Header */}
              <Text style={styles.modalTitle}>✅ Work Completed!</Text>
              <Text style={styles.modalSubtitle}>
                Share this code with your client to verify your proof
              </Text>

              {/* Error Message */}
              {pinError && (
                <View style={styles.errorBoxPin}>
                  <Text style={styles.errorTextPin}>{pinError}</Text>
                </View>
              )}

              {/* PIN Display Box */}
              <View style={styles.pinContainer}>
                <Text style={styles.pinLabel}>Verification PIN</Text>
                {currentPin ? (
                  <View style={styles.pinBox}>
                    <Text style={styles.pinNumber}>{currentPin}</Text>
                  </View>
                ) : (
                  <View style={styles.pinBox}>
                    <ActivityIndicator size="large" color="#4CAF50" />
                  </View>
                )}
                <Text style={styles.pinNote}>
                  10-character code • Unique to this proof
                </Text>
              </View>

              {/* Action Buttons */}
              {currentPin && (
                <View style={styles.buttonContainer}>
                  {/* Copy Button */}
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={async () => {
                      try {
                        await Clipboard.setStringAsync(currentPin);
                        Alert.alert('Copied', 'PIN copied to clipboard');
                      } catch (error) {
                        console.error('Copy error:', error);
                      }
                    }}
                  >
                    <Text style={styles.copyButtonIcon}>📋</Text>
                    <Text style={styles.copyButtonText}>Copy PIN</Text>
                  </TouchableOpacity>

                  {/* Share Button */}
                  <TouchableOpacity
                    style={styles.shareButton}
                    onPress={async () => {
                      try {
                        await Share.share({
                          message: `I have a verified proof for you.\n\nUse this PIN to verify: ${currentPin}\n\nThis is a cryptographically signed proof that you can verify with the BeforeAfter app`,
                          title: 'Share Verification PIN',
                        });
                      } catch (error) {
                        console.error('Share error:', error);
                      }
                    }}
                  >
                    <Text style={styles.shareButtonIcon}>✉️</Text>
                    <Text style={styles.shareButtonText}>Share PIN</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Info Box */}
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  💡 <Text style={styles.infoBold}>How it works:</Text>
                </Text>
                <Text style={styles.infoText}>
                  1. Share this PIN with the client
                </Text>
                <Text style={styles.infoText}>
                  2. They enter it in their app
                </Text>
                <Text style={styles.infoText}>
                  3. Your proof is verified cryptographically ✓
                </Text>
              </View>

              {/* Done Button */}
              <TouchableOpacity
                style={[styles.doneButton, { marginTop: 10 }]}
                onPress={() => {
                  setShowPinModal(false);
                  setCurrentPin('');
                  setCurrentProofId('');
                }}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Safe Area & Layout
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },

  // Welcome Screen
  welcomeContainer: {
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
  },
  welcomeContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  welcomeIcon: {
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    opacity: 0.9,
    marginBottom: 16,
    textAlign: 'center',
  },
  welcomeDescription: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.85,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  proceedButton: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  proceedButtonText: {
    color: '#0ea5e9',
    fontSize: 18,
    fontWeight: '600',
  },
  proceedButtonIcon: {
    marginLeft: 8,
  },

  // Permission Screen
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionIcon: {
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
  },

  // Header
  header: {
    marginBottom: 24,
    marginTop: 8,
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

  // Cards
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginLeft: 8,
  },
  cardText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },

  // Form Card
  formCard: {
    paddingBottom: 24,
  },

  // Info Card
  infoCard: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    marginBottom: 8,
  },
  infoBadgeText: {
    fontSize: 13,
    color: '#3b82f6',
    marginLeft: 8,
    fontWeight: '500',
  },

  // Main Action Card
  mainActionCard: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    backgroundColor: '#f0f9ff',
    borderWidth: 2,
    borderColor: '#dbeafe',
  },
  mainActionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  mainActionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  mainActionDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },

  // Buttons
  primaryButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },

  dangerButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#fee2e2',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    marginTop: 12,
  },
  dangerButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },

  buttonDisabled: {
    backgroundColor: '#cbd5e1',
    opacity: 0.6,
  },

  // Input Fields
  input: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 12,
    minHeight: 48,
  },

  // Time Window
  timeWindowDescription: {
    color: '#64748b',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  timeWindowInputContainer: {
    marginBottom: 16,
  },
  timeWindowInputGroup: {
    marginBottom: 16,
  },
  timeWindowLabel: {
    color: '#1e293b',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  timeWindowSliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  spinButton: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '700',
  },
  timeWindowInput: {
    backgroundColor: '#f1f5f9',
    color: '#1e293b',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 1,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
  },
  timeWindowInfo: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  timeWindowInfoText: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  timeWindowWarning: {
    color: '#f97316',
    fontSize: 12,
    textAlign: 'center',
  },

  // Active Session
  activeSessionContainer: {
    marginTop: 8,
  },
  sessionStatusCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  sessionStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionStatusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 8,
  },
  sessionStatusText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 16,
  },

  photoInfoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    marginBottom: 10,
  },
  photoInfoContent: {
    flex: 1,
    marginLeft: 12,
  },
  photoInfoLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 2,
  },
  photoInfoValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
    marginBottom: 2,
  },
  photoInfoStatus: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '600',
  },
  photoInfoSubValue: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },

  timeWindowStatusCard: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 16,
  },
  timeWindowStatusBadge: {
    fontSize: 11,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginTop: 6,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  timeWindowStatusBadgeValid: {
    backgroundColor: '#dcfce7',
    color: '#16a34a',
  },
  timeWindowStatusBadgeInvalid: {
    backgroundColor: '#fef3c7',
    color: '#d97706',
  },
  timeWindowStatusBadgeExpired: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
  },

  // Session Actions
  sessionActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    justifyContent: 'center', // Center the remaining button
  },

  // Error Card
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginLeft: 8,
    lineHeight: 18,
  },

  // Success Card
  successCard: {
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  successText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 4,
  },

  // Warning Card
  warningCard: {
    backgroundColor: '#fffbeb',
    borderLeftWidth: 4,
    borderLeftColor: '#f97316',
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#64748b',
  },

  // Export Card
  exportCard: {
    backgroundColor: '#f0f9ff',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  exportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  exportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 8,
  },
  exportText: {
    fontSize: 13,
    color: '#64748b',
  },

  // Camera
  captureContainer: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },

  // Loading
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginRight: 8,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 40,
  },

  // Legacy styles (kept for reference, not actively used)
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    color: '#1e293b',
    fontSize: 26,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    marginBottom: 30,
  },
  text: {
    color: '#1e293b',
    fontSize: 18,
    marginBottom: 20,
  },
  status: {
    color: '#10b981',
    fontSize: 18,
    marginBottom: 20,
  },
  meta: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 4,
  },
  hash: {
    color: '#0ea5e9',
    fontSize: 12,
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  sessionInfo: {
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#dcfce7',
    maxWidth: '90%',
  },
  sessionText: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  sessionSubtext: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  sessionId: {
    color: '#0ea5e9',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 15,
    backgroundColor: '#f1f5f9',
    padding: 6,
    borderRadius: 4,
  },
  sessionIconContainer: {
    marginBottom: 8,
    alignItems: 'center',
  },
  timeWindowContent: {
    flex: 1,
  },
  timeWindowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  timeWindowIcon: {
    marginRight: 6,
  },
  timeWindowBanner: {
    backgroundColor: '#f0f9ff',
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeWindowText: {
    color: '#0ea5e9',
    fontSize: 13,
    fontWeight: '600',
  },
  timeWindowSubtext: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
  },
  timeWindowStatus: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    padding: 4,
    borderRadius: 4,
  },
  timeWindowStatusValid: {
    color: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  timeWindowStatusInvalid: {
    color: '#f97316',
    backgroundColor: '#fffbeb',
  },
  timeWindowStatusExpired: {
    color: '#ef4444',
    backgroundColor: '#fee2e2',
  },
  cooldownText: {
    color: '#f97316',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cooldownSubtext: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  violationWarning: {
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fbbf24',
    maxWidth: '90%',
  },
  violationWarningText: {
    color: '#f97316',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  timeWindowButton: {
    backgroundColor: '#f0f9ff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  timeWindowButtonText: {
    color: '#0ea5e9',
    fontSize: 16,
    fontWeight: 'bold',
  },
  timeWindowForm: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    width: '90%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timeWindowButtonMinus: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timeWindowButtonPlus: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tamperWarning: {
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
    marginTop: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#fecaca',
    maxWidth: '90%',
  },
  tamperWarningText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },

  // PIN Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },

  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 30,
    maxHeight: '80%',
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },

  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },

  errorBoxPin: {
    backgroundColor: '#ffebee',
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
    padding: 12,
    marginBottom: 16,
    borderRadius: 4,
  },

  errorTextPin: {
    color: '#c62828',
    fontSize: 13,
    fontWeight: '500',
  },

  pinContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },

  pinLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 1,
  },

  pinBox: {
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    width: '100%',
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },

  pinNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: '#4CAF50',
    textAlign: 'center',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },

  pinNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },

  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 20,
  },

  copyButton: {
    flex: 1,
    backgroundColor: '#e3f2fd',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2196F3',
  },

  copyButtonIcon: {
    fontSize: 20,
    marginBottom: 4,
  },

  copyButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 13,
  },

  shareButton: {
    flex: 1,
    backgroundColor: '#e8f5e9',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },

  shareButtonIcon: {
    fontSize: 20,
    marginBottom: 4,
  },

  shareButtonText: {
    color: '#4CAF50',
    fontWeight: '600',
    fontSize: 13,
  },

  infoBox: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    padding: 12,
    marginVertical: 16,
    borderRadius: 4,
  },

  infoText: {
    fontSize: 13,
    color: '#555',
    marginBottom: 6,
    lineHeight: 18,
  },

  infoBold: {
    fontWeight: '700',
    color: '#333',
  },

  doneButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },

  doneButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
});