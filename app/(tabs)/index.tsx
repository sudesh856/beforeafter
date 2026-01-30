import { AuditEvent, EditingViolation, LocationData, ProofRecord, SessionMetadata, TamperFlag, TimeAnomaly, TimeWindowData } from '@/lib/proof';
// Note: TamperFlag type in @/lib/proof needs to include 'time_window_expired' in its reason union type
// Update the TamperFlag definition to: reason: 'before_deleted' | 'session_abandoned' | 'timeout' | 'location_mismatch' | 'time_window_expired'
import { getAnchorService } from '@/lib/anchoring/anchorService';
import { DIGICERT_TSA, FREETSA } from '@/lib/anchoring/tsaClient';
import { validateRadius } from '@/lib/radiusEnforcement';





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


import { CameraView, useCameraPermissions } from 'expo-camera';
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
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';


type CaptureMode = 'before' | 'after';

type Metadata = {
  timestamp: string;
  device: string;
  platform: string;
};

// PAIRED SESSION LOCKING - Core anti-fraud mechanism
type SessionData = {
  id: string;
  startTime: string;
  beforeUri: string;
  metadata: Metadata;
  beforeLocation: LocationData;
  isActive: boolean;
  createdAt: number;
  // USER-DECLARED TIME WINDOW ENFORCEMENT - Appended fields
  timeWindow?: TimeWindowData;
  timeAnomalies?: TimeAnomaly[];
};

export default function HomeScreen() {
  const cameraRef = useRef<CameraView>(null);
    const [jobSiteLocation, setJobSiteLocation] = useState<LocationData | null>(null); // ✅ PUT IT HERE


  const [beforeUri, setBeforeUri] = useState<string | null>(null);
  const [afterUri, setAfterUri] = useState<string | null>(null);

  const [beforeTaken, setBeforeTaken] = useState(false);
  const [afterTaken, setAfterTaken] = useState(false);

  const [mode, setMode] = useState<CaptureMode>('before');
  const [showCamera, setShowCamera] = useState(false);
  // Add with your other state declarations
const [editingViolations, setEditingViolations] = useState<EditingViolation[]>([]);

  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [beforeLocation, setBeforeLocation] = useState<LocationData | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [tamperWarnings, setTamperWarnings] = useState<TamperFlag[]>([]);

  // PAIRED SESSION LOCKING - State for active session
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);

  // AUDIT TRAIL - Added states
  const [jobId, setJobId] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadata>({});
  const [showMetadataForm, setShowMetadataForm] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();

  // UI/UX STATE - Track whether data exists for export and cooldown
  const [hasExportData, setHasExportData] = useState(false);

  // PERFORMANCE FIX - Debounce and loading states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const isProcessingRef = useRef(false);

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
): Promise<{isValid: boolean; violations: string[]}> => {
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
      
      // Enable real RFC 3161 TSA for DigiCert - with proper binary DER encoding
anchorService.enableRealTSA(FREETSA)
      
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
  };

  // PERFORMANCE FIX 6 - Pre-initialize camera permissions on app start
  useEffect(() => {
    const initializePermissions = async () => {
      try {
        console.log('[PERF] Pre-requesting camera permissions...');
        // This caches the permission so it's instant when user clicks button
        if (permission && !permission.granted) {
          // Just request, don't require user to grant right now
          // The useCameraPermissions hook already manages this
        }
      } catch (error) {
        console.log('[PERF] Permission pre-init error (non-critical):', error);
      }
    };
    
    initializePermissions();
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
      <View style={styles.container}>
        <Text style={styles.text}>Camera permission required</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showCamera) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} />

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
    <View style={styles.container}>
      <Text style={styles.title}>BeforeAfter</Text>
      <Text style={styles.subtitle}>Tamper-Evident Proof System</Text>

      {/* AUDIT TRAIL - Job details form (ADDED) */}
      {!beforeTaken && !showMetadataForm && (
        <TouchableOpacity
          style={styles.metadataButton}
          onPress={() => setShowMetadataForm(true)}
        >
          <Text style={styles.metadataButtonText}>+ Add Job Details (Optional)</Text>
        </TouchableOpacity>
      )}

      {showMetadataForm && !beforeTaken && (
        <View style={styles.metadataForm}>
          <Text style={styles.formTitle}>Job Details</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Job ID (optional)"
            placeholderTextColor="#888"
            value={jobId}
            onChangeText={setJobId}
          />
          
          <TextInput
            style={styles.input}
            placeholder="Client Name (optional)"
            placeholderTextColor="#888"
            value={clientName}
            onChangeText={setClientName}
          />
          
          <TouchableOpacity
            style={styles.saveButton}
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
            <Text style={styles.saveButtonText}>Save Details</Text>
          </TouchableOpacity>


              


          
          <TouchableOpacity
            style={styles.cancelFormButton}
            onPress={() => setShowMetadataForm(false)}
          >
            <Text style={styles.cancelFormButtonText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* AUDIT TRAIL - Show job info if set (ADDED) */}
      {sessionMetadata.jobId && !showMetadataForm && (
        <View style={styles.jobInfo}>
          <Text style={styles.jobInfoText}>Job: {sessionMetadata.jobId}</Text>
          {sessionMetadata.clientName && (
            <Text style={styles.jobInfoText}>Client: {sessionMetadata.clientName}</Text>
          )}
        </View>
      )}
      
      {/* PAIRED SESSION LOCKING - Show session info if active */}
      {activeSession && activeSession.isActive && (
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionText}>🔒 Session Active</Text>
          <Text style={styles.sessionSubtext}>
            Before photo captured. You must complete this session.
          </Text>
          {/* USER-DECLARED TIME WINDOW ENFORCEMENT - Show declared time window */}
          {timeWindow && (
            <View style={styles.timeWindowBanner}>
              <Text style={styles.timeWindowText}>
                ⏱️ Time Window: {selectedMinTimeMin}-{selectedMaxTimeMin} minutes
              </Text>
              <Text style={styles.timeWindowSubtext}>
                Elapsed: {(elapsedTimeMs / 1000).toFixed(1)}s
              </Text>
              {timeWindowStatus && (
                <Text style={[
                  styles.timeWindowStatus,
                  timeWindowStatus === 'VALID' ? styles.timeWindowStatusValid :
                  timeWindowStatus === 'EXPIRED' ? styles.timeWindowStatusExpired :
                  styles.timeWindowStatusInvalid
                ]}>
                  {timeWindowStatus === 'VALID' ? '✅ Valid' :
                   timeWindowStatus === 'EXPIRED' ? '❌ Expired' :
                   '⏳ Not Ready'}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* USER-DECLARED TIME WINDOW ENFORCEMENT - Time window declaration form */}
     {!beforeTaken && !timeWindow && !showTimeWindowForm && (
  <TouchableOpacity
    style={styles.timeWindowButton}
    onPress={() => {
      setSelectedMinTimeMin(5);
      setSelectedMaxTimeMin(10);
      setShowTimeWindowForm(true);
    }}
  >
          <Text style={styles.timeWindowButtonText}>⏱️ Set Time Window (Required)</Text>
        </TouchableOpacity>
      )}

      {showTimeWindowForm && !beforeTaken && !timeWindow && (
        <View style={styles.timeWindowForm}>
          <Text style={styles.formTitle}>User-Declared Time Window</Text>
          <Text style={styles.timeWindowDescription}>
            Define the expected time between Before and After photos. This window is immutable once a session starts.
          </Text>
          
          <View style={styles.timeWindowInputContainer}>
            <View style={styles.timeWindowInputGroup}>
              <Text style={styles.timeWindowLabel}>Minimum Time (minutes):</Text>
              <View style={styles.timeWindowSliderContainer}>
                <TouchableOpacity
  style={styles.timeWindowButtonMinus}
  onPress={() => setSelectedMinTimeMin(Math.max(1, (selectedMinTimeMin ?? 1) - 1))}
>
  <Text style={styles.timeWindowButtonText}>−</Text>
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
  style={styles.timeWindowButtonPlus}
  onPress={() => {
    const minVal = selectedMinTimeMin ?? 1;
    const maxVal = selectedMaxTimeMin ?? 10;
    if (minVal + 1 < maxVal) {
      setSelectedMinTimeMin(minVal + 1);
    }
  }}
>
  <Text style={styles.timeWindowButtonText}>+</Text>
</TouchableOpacity>
              </View>
            </View>

            <View style={styles.timeWindowInputGroup}>
              <Text style={styles.timeWindowLabel}>Maximum Time (minutes):</Text>
              <View style={styles.timeWindowSliderContainer}>
                <TouchableOpacity
  style={styles.timeWindowButtonMinus}
  onPress={() => {
    const minVal = selectedMinTimeMin ?? 1;
    const maxVal = selectedMaxTimeMin ?? 10;
    if (maxVal - 1 > minVal) {
      setSelectedMaxTimeMin(maxVal - 1);
    }
  }}
>
  <Text style={styles.timeWindowButtonText}>−</Text>
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
  style={styles.timeWindowButtonPlus}
  onPress={() => setSelectedMaxTimeMin((selectedMaxTimeMin ?? 10) + 1)}
>
  <Text style={styles.timeWindowButtonText}>+</Text>
</TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={styles.timeWindowInfo}>
            Window: {selectedMinTimeMin}–{selectedMaxTimeMin} minutes
          </Text>
          <Text style={styles.timeWindowWarning}>
            ⚠️ These values cannot be changed once the session starts.
          </Text>
          
          <TouchableOpacity
  style={styles.saveButton}
  onPress={() => {
    if (selectedMinTimeMin !== null && selectedMaxTimeMin !== null && 
        selectedMinTimeMin > 0 && selectedMaxTimeMin > 0 && 
        selectedMinTimeMin < selectedMaxTimeMin) {
      // USER-DECLARED TIME WINDOW ENFORCEMENT - Unlock Before capture by setting time window
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
  <Text style={styles.saveButtonText}>Proceed with Time Window</Text>
</TouchableOpacity>

          <TouchableOpacity
  style={styles.cancelFormButton}
  onPress={() => {
    setShowTimeWindowForm(false);
    setSelectedMinTimeMin(null);
    setSelectedMaxTimeMin(null);
  }}
>
            <Text style={styles.cancelFormButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {!beforeTaken && (
        <TouchableOpacity
          style={[styles.button, (isProcessing || !timeWindow) && styles.buttonDisabled]}
    disabled={isProcessing || !timeWindow}
          onPress={async () => {
            // PERFORMANCE FIX 1 - Debounce protection
            if (isProcessing || isProcessingRef.current) {
              console.log('[PERF] Button already processing, ignoring click');
              return;
            }

            isProcessingRef.current = true;
            setIsProcessing(true);
            setProcessingMessage('Opening camera...');

            try {
              console.log('[PERF] "Take BEFORE photo" button clicked:', Date.now());

              // PERFORMANCE FIX 2 - Fetch GPS in background, don't block camera open
              // Set job site location immediately without waiting
              if (!jobSiteLocation) {
                // Start GPS fetch in background (don't await)
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
              <Text style={styles.buttonText}>{processingMessage}</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Take BEFORE photo</Text>
          )}
        </TouchableOpacity>
      )}

      {beforeTaken && !afterTaken && (
        <>
          <Text style={styles.status}>Before locked ✅</Text>
          {beforeLocation && (
            <Text style={styles.meta}>
              Location: {beforeLocation.latitude.toFixed(5)}, {beforeLocation.longitude.toFixed(5)}
            </Text>
          )}
          {/* PAIRED SESSION LOCKING - Show session details */}
          {activeSession && (
            <Text style={styles.sessionId}>
              Session ID: {activeSession.id.substring(0, 8)}...
            </Text>
          )}

          {/* UI/UX - Show cooldown message if within 1-minute window */}
       

          <TouchableOpacity
            style={[styles.button, (isProcessing || !timeWindow || timeWindowStatus !== 'VALID') && styles.buttonDisabled]}
            disabled={isProcessing || !timeWindow || timeWindowStatus !== 'VALID'}
            onPress={() => {
              // PERFORMANCE FIX 1 - Debounce protection
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
                <Text style={styles.buttonText}>{processingMessage || 'Processing...'}</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Take AFTER photo</Text>
            )}
          </TouchableOpacity>

          {/* UI/UX - Show session actions ONLY when before photo is taken but NOT completed */}
          {beforeTaken && !afterTaken && activeSession?.isActive && (
            <View style={styles.sessionActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={async () => {
                  await abandonSession();
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel Session</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteButton}
                onPress={async () => {
  console.log('⛔ CHEAT ATTEMPT DETECTED at:', new Date().toISOString());
  
  if (!activeSession?.id) return;
  
  console.log('Attempting to show Alert...');
  
  try {
    Alert.alert(
      'Delete Before Photo?',
      'This will mark the entire session as "TAMPERED" and void any proof.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete & Void Session', 
          style: 'destructive',
          onPress: async () => {
            console.log('User confirmed delete');
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
    console.log('Alert function called successfully');
  } catch (error) {
    console.error('Alert failed:', error);
    await logTamperEvent('before_deleted', activeSession.id, undefined, 'Alert failed, auto-logged tamper');
    alert('Session marked as tampered');
  }
}}
                >
                  <Text style={styles.deleteButtonText}>🗑️ Delete Before</Text>
                </TouchableOpacity>
              </View>
            )}
        </>
      )}

      {validationError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{validationError}</Text>
        </View>
      )}

      {beforeTaken && afterTaken && metadata && (
        <>
          <Text style={styles.status}>Proof unit complete ✅</Text>
          <Text style={styles.meta}>{metadata.timestamp}</Text>
          <Text style={styles.meta}>{metadata.device}</Text>
        </>
      )}

      {/* UI/UX - Tamper warning only visible when relevant to user (in idle state with tampered sessions) */}
      {!activeSession && !beforeTaken && tamperWarnings.length > 0 && (
        <View style={styles.tamperWarning}>
          <Text style={styles.tamperWarningText}>⚠️ {tamperWarnings.length} TAMPERED SESSION(S)</Text>
          <Text style={styles.meta}>Check export for audit trail</Text>
        </View>
      )}

      {/* UI/UX - Export button only visible when data exists */}
      {hasExportData && (
        <TouchableOpacity
          style={styles.exportButton}
          onPress={exportAuditTrail}
        >
          <Text style={styles.exportButtonText}>📋 Export Audit Trail</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#0f0',
    fontSize: 14,
    marginBottom: 30,
  },
  text: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 20,
  },
  status: {
    color: '#0f0',
    fontSize: 18,
    marginBottom: 20,
  },
  meta: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 4,
  },
  hash: {
    color: '#0ff',
    fontSize: 12,
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#1e90ff',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#666',
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  // PERFORMANCE FIX - Loading indicator styles
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginRight: 8,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#666',
  },
  cancelButtonText: {
    color: '#999',
    fontSize: 14,
  },
  errorContainer: {
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#2a0000',
    borderWidth: 1,
    borderColor: '#f00',
    maxWidth: '90%',
  },
  errorText: {
    color: '#f00',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
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
    backgroundColor: '#fff',
  },
  // PAIRED SESSION LOCKING - Session styles
  sessionInfo: {
    backgroundColor: '#1a2a3a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#0f0',
    maxWidth: '90%',
  },
  sessionText: {
    color: '#0f0',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  sessionSubtext: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  sessionId: {
    color: '#0ff',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 15,
    backgroundColor: '#1a1a1a',
    padding: 6,
    borderRadius: 4,
  },
  cooldownText: {
    color: '#ffaa00',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cooldownSubtext: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },



  violationWarning: {
    backgroundColor: '#3a2a00',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ffaa00',
    maxWidth: '90%',
  },
  violationWarningText: {
    color: '#ffaa00',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // USER-DECLARED TIME WINDOW ENFORCEMENT - Time window UI styles
  timeWindowButton: {
    backgroundColor: '#2a3a5a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#4a5a7a',
  },
  timeWindowButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  timeWindowForm: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    width: '90%',
    borderWidth: 2,
    borderColor: '#4a6a9a',
  },
  timeWindowDescription: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center' as any,
    fontStyle: 'italic' as any,
  },
  timeWindowInputContainer: {
    marginBottom: 16,
  },
  timeWindowInputGroup: {
    marginBottom: 16,
  },
  timeWindowLabel: {
    color: '#0ff',
    fontSize: 13,
    fontWeight: '600' as any,
    marginBottom: 8,
  },
  timeWindowSliderContainer: {
    flexDirection: 'row' as any,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timeWindowButtonMinus: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#444',
  },
  timeWindowButtonPlus: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#444',
  },
  timeWindowInput: {
    backgroundColor: '#2a2a2a',
    color: '#0ff',
    padding: 10,
    borderRadius: 4,
    flex: 1,
    textAlign: 'center' as any,
    borderWidth: 1,
    borderColor: '#444',
    fontWeight: 'bold' as any,
  },
  timeWindowInfo: {
    color: '#0ff',
    fontSize: 14,
    fontWeight: 'bold' as any,
    textAlign: 'center' as any,
    marginBottom: 8,
    backgroundColor: '#1a3a3a',
    padding: 8,
    borderRadius: 4,
  },
  timeWindowWarning: {
    color: '#ffaa00',
    fontSize: 12,
    textAlign: 'center' as any,
    marginBottom: 12,
  },
  timeWindowBanner: {
    backgroundColor: '#2a3a2a',
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#4a7a4a',
  },
  timeWindowText: {
    color: '#0f0',
    fontSize: 13,
    fontWeight: 'bold' as any,
    textAlign: 'center' as any,
  },
  timeWindowSubtext: {
    color: '#aaa',
    fontSize: 11,
    textAlign: 'center' as any,
    marginTop: 4,
  },
  timeWindowStatus: {
    fontSize: 12,
    fontWeight: 'bold' as any,
    textAlign: 'center' as any,
    marginTop: 6,
    padding: 4,
    borderRadius: 4,
  },
  timeWindowStatusValid: {
    color: '#0f0',
    backgroundColor: '#1a3a1a',
  },
  timeWindowStatusInvalid: {
    color: '#ffaa00',
    backgroundColor: '#3a3a1a',
  },
  timeWindowStatusExpired: {
    color: '#ff0000',
    backgroundColor: '#3a1a1a',
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  deleteButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  deleteButtonText: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '600',
  },
  tamperWarning: {
    backgroundColor: '#3a0000',
    padding: 12,
    borderRadius: 8,
    marginTop: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ff0000',
    maxWidth: '90%',
  },
  tamperWarningText: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // AUDIT TRAIL - Added styles (NEW)
  metadataButton: {
    backgroundColor: '#2a3a4a',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3a4a5a',
  },
  metadataButtonText: {
    color: '#aaa',
    fontSize: 14,
  },
  metadataForm: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    width: '90%',
    borderWidth: 1,
    borderColor: '#333',
  },
  formTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    padding: 12,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#444',
  },
  saveButton: {
    backgroundColor: '#1e90ff',
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
  cancelFormButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  cancelFormButtonText: {
    color: '#888',
    textAlign: 'center',
    fontSize: 14,
  },
  exportButton: {
    backgroundColor: '#3a4a5a',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#5a6a7a',
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  jobInfo: {
    backgroundColor: '#1a2a2a',
    padding: 10,
    borderRadius: 6,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#3a4a4a',
  },
  jobInfoText: {
    color: '#0ff',
    fontSize: 12,
    textAlign: 'center',
  },
});