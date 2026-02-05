import { ExternalAnchor } from '@/lib/anchoring/anchorTypes';

// Re-export for convenience
export { ExternalAnchor } from '@/lib/anchoring/anchorTypes';

export type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type PhotoIntegrity = {
  captureTime: string;
  lastModified: string;
  hashSignature: string;
  edited: boolean;
  editDetails?: string[];
};

export type EditingViolation = {
  id: string;
  timestamp: string;
  sessionId: string;
  photoType: 'before' | 'after';
  violationType: 'crop' | 'rotate' | 'filter' | 'adjustment' | 'metadata_change';
  details: string;
};

export type RadiusEnforcement = {
  jobSiteLocation: LocationData;
  radiusMeters: number;
  enforced: boolean;
};

export type SessionStatus = 'active' | 'completed' | 'tampered' | 'incomplete' | 'voided';

export type TamperFlag = {
  id: string;
  timestamp: string;
  reason: 'before_deleted' | 'session_abandoned' | 'timeout' | 'location_mismatch' | 'time_window_expired';
  sessionId: string;
  proofId?: string;
  details?: string;
};

export type TimeWindowData = {
  minTimeMs: number;
  maxTimeMs: number;
  actualElapsedMs: number;
  timeSource: 'monotonic' | 'system_clock';
  timeVerificationStatus: 'VALID' | 'INVALID' | 'EXPIRED';
  createdAt: string;
};

export type TimeAnomaly = {
  id: string;
  timestamp: string;
  sessionId: string;
  anomalyType: 'app_backgrounded' | 'app_foregrounded' | 'clock_change_detected' | 'system_reboot_suspected' | 'timeout_exceeded';
  details: string;
  timeSourceAtEvent: 'monotonic' | 'system_clock';
};

export type SessionMetadata = {
  jobId?: string;
  clientName?: string;
  projectName?: string;
  notes?: string;
  tags?: string[];
};

export type AuditEvent = {
  id: string;
  type: 'session_start' | 'before_capture' | 'after_capture' | 'proof_created' | 'session_cancelled' | 'export_requested' | 'session_metadata_updated' | 'tamper_detected' | 'editing_violation' | 'time_window_declared' | 'time_window_block_early' | 'time_window_expired' | 'time_window_valid' | 'time_anomaly_detected' | 'anchor_failed';
  timestamp: string;
  sessionId?: string;
  proofId?: string;
  location?: LocationData;
  metadata?: {
    device?: string;
    platform?: string;
    jobId?: string;
    clientName?: string;
    notes?: string;
    tags?: string[];
    verificationCode?: string;
    distance?: number;
    minTimeMs?: number;
    maxTimeMs?: number;
    actualElapsedMs?: number;
    timeSource?: 'monotonic' | 'system_clock';
    anomalyType?: string;
  };
};

export type ProofRecord = {
  id: string;
  beforeUri: string;
  afterUri: string;
  createdAt: string;
  deviceName: string;
  platform: string;
  beforeHash: string;
  afterHash: string;
  sessionId: string;
  proofHash: string;
  beforeLocation: LocationData;
  afterLocation: LocationData;
  verificationCode: string;
  algorithmVersion: string;
  radiusEnforcement?: RadiusEnforcement;
  latitude?: number;
  longitude?: number;
  jobId?: string;
  clientName?: string;
  beforeTimestamp?: string;
  afterTimestamp?: string;
  title?: string;
  tamperFlags?: TamperFlag[];
  beforeIntegrity?: PhotoIntegrity;
  afterIntegrity?: PhotoIntegrity;
  sessionMetadata?: { id: string };
  externalAnchor?: ExternalAnchor;
  timeWindow?: TimeWindowData;
  timeAnomalies?: TimeAnomaly[];
  creatorDeviceId?: string; // Device ID of creator (prevents self-witnessing)
};

export type ProofRecordExtended = ProofRecord & {
  timeWindow?: TimeWindowData;
  timeAnomalies?: TimeAnomaly[];
};

export type AuditEventExtended = AuditEvent & {
  // time_window_* event types available via AuditEvent.type
};