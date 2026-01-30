// platformExport.ts
// Generates standardized verification reports for platforms like Thumbtack, Angi, insurance companies

import { LocationData, ProofRecord } from './proof';

export interface VerificationReport {
  version: string; // Report format version for platform compatibility
  reportId: string;
  generatedAt: string;
  
  // Core proof data
  proof: {
    id: string;
    title: string;
    verificationCode: string;
    createdAt: string;
    
    // Before photo verification
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
    
    // After photo verification
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
    
    // Spatial & temporal verification
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
      radiusEnforcement?: {
        jobSiteLocation: LocationData;
        beforeDistance: number;
        afterDistance: number;
        radiusMeters: number;
        compliant: boolean;
      };
    };
    
    // ISSUE 2: Time Window Data
    timeWindow?: {
      declaredMinMinutes: number;
      declaredMaxMinutes: number;
      actualDurationMinutes: number;
      withinWindow: boolean;
    };

    // External Timestamp Anchor (RFC 3161 TSA)
// External Timestamp Anchor (RFC 3161 TSA)
externalAnchor?: {
  status?: string;
  method?: string;
  anchoredAt?: string;
  verification?: string;
  tsaUrl?: string;
  tsaName?: string;
  tokenData?: string;
  authenticatedTime?: string;
  serialNumber?: string;
  hashedValue?: string;
  isValid?: boolean;
};

    
  };
  
  // Platform integration metadata
  platformMetadata: {
    exportFormat: 'json' | 'pdf';
    apiVersion: string;
    certificationLevel: 'basic' | 'verified' | 'certified';
    trustScore: {
      total: number; // 0-100 overall score
      breakdown: {
        verificationCode: number; // 20 if present
        hashIntegrity: number; // 30 if both hashes valid
        locationVerification: number; // 20 if both locations valid
        integrityChecks: number; // 20 if photos unedited
        sessionIntegrity: number; // 10 if session ID exists
      };
    };
  };
  
  // ISSUE 4: Audit Trail
  auditTrail?: Array<{
    type: string;
    timestamp: string;
    sessionId?: string;
    proofId?: string;
    metadata?: any;
  }>;
}

/**
 * Calculate trust score with detailed breakdown
 */
export function calculateTrustScore(proof: ProofRecord): { total: number; breakdown: { verificationCode: number; hashIntegrity: number; locationVerification: number; integrityChecks: number; sessionIntegrity: number; } } {
  const breakdown = {
    verificationCode: proof.verificationCode ? 20 : 0,
    hashIntegrity: (proof.beforeHash && proof.afterHash) ? 30 : 0,
    locationVerification: 0,
    integrityChecks: 0,
    sessionIntegrity: proof.sessionMetadata?.id ? 10 : 0,
  };
  
  // Location verification (20 points max)
  if (proof.beforeLocation && proof.afterLocation) {
    breakdown.locationVerification = 10;
    const distance = calculateDistance(proof.beforeLocation, proof.afterLocation);
    if (distance <= 100) breakdown.locationVerification = 20;
  }
  
  // Integrity checks (20 points max)
  let integrityPoints = 0;
  if (proof.beforeIntegrity && !proof.beforeIntegrity.edited) integrityPoints += 10;
  if (proof.afterIntegrity && !proof.afterIntegrity.edited) integrityPoints += 10;
  breakdown.integrityChecks = integrityPoints;
  
  const total = Math.min(
    breakdown.verificationCode + breakdown.hashIntegrity + breakdown.locationVerification + breakdown.integrityChecks + breakdown.sessionIntegrity,
    100
  );
  
  return { total, breakdown };
}

/**
 * Calculate distance between two GPS points (Haversine formula)
 */
function calculateDistance(point1: LocationData, point2: LocationData): number {
  const R = 6371e3;
  const φ1 = (point1.latitude * Math.PI) / 180;
  const φ2 = (point2.latitude * Math.PI) / 180;
  const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Generate JSON verification report
 */
export function generateJSONReport(proof: ProofRecord, auditTrail?: any[]): VerificationReport {
  const distance = proof.beforeLocation && proof.afterLocation
    ? calculateDistance(proof.beforeLocation, proof.afterLocation)
    : 0;
  
const beforeTime = new Date(proof.beforeTimestamp || proof.createdAt).getTime();
const afterTime = new Date(proof.afterTimestamp || proof.createdAt).getTime();
  const durationMinutes = (afterTime - beforeTime) / 1000 / 60;
  
  const trustScore = calculateTrustScore(proof);
  
  // ISSUE 2: Derive time window data from proof
  const timeWindowData = proof.timeWindow ? {
    declaredMinMinutes: Math.round(proof.timeWindow.minTimeMs / 60000),
    declaredMaxMinutes: Math.round(proof.timeWindow.maxTimeMs / 60000),
    actualDurationMinutes: Math.round(proof.timeWindow.actualElapsedMs / 60000),
    withinWindow: proof.timeWindow.actualElapsedMs >= proof.timeWindow.minTimeMs && 
                  proof.timeWindow.actualElapsedMs <= proof.timeWindow.maxTimeMs,
  } : undefined;
  
  // ISSUE 4: Filter audit trail to minimum required events for this proof
  const relevantAuditEvents = auditTrail ? auditTrail.filter(event => 
    (event.sessionId === proof.sessionMetadata?.id) &&
    ['session_start', 'time_window_declared', 'before_capture', 'after_capture', 'proof_created'].includes(event.type)
  ) : [];
  
  const report: VerificationReport = {
    version: '1.0.0',
    reportId: `VR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    generatedAt: new Date().toISOString(),
    
    proof: {
      id: proof.id,
      title: proof.title || `Work Verification ${proof.verificationCode}`,
      verificationCode: proof.verificationCode,
      createdAt: proof.createdAt,
      
      before: {
timestamp: proof.beforeTimestamp || proof.createdAt,
        location: proof.beforeLocation || { latitude: 0, longitude: 0, accuracy: null },
        imageHash: proof.beforeHash,
        // ISSUE 3: Extended integrity data
        integrity: {
tampered: (proof.tamperFlags && proof.tamperFlags.length > 0) || false,
          edited: proof.beforeIntegrity?.edited || false,
          captureTime: proof.beforeIntegrity?.captureTime || proof.beforeTimestamp || proof.createdAt,
          lastModified: proof.beforeIntegrity?.lastModified || proof.beforeTimestamp || proof.createdAt,
          hashSignature: proof.beforeIntegrity?.hashSignature || proof.beforeHash,
        },
      },
      
      after: {
timestamp: proof.afterTimestamp || proof.createdAt,
        location: proof.afterLocation || { latitude: 0, longitude: 0, accuracy: null },
        imageHash: proof.afterHash,
        // ISSUE 3: Extended integrity data
        integrity: {
tampered: (proof.tamperFlags && proof.tamperFlags.length > 0) || false,
          edited: proof.afterIntegrity?.edited || false,
          captureTime: proof.afterIntegrity?.captureTime || proof.afterTimestamp || proof.createdAt,
          lastModified: proof.afterIntegrity?.lastModified || proof.afterTimestamp || proof.createdAt,
          hashSignature: proof.afterIntegrity?.hashSignature || proof.afterHash,
        },
      },
      
      verification: {
        locationProximity: {
          distanceMeters: Math.round(distance),
          withinThreshold: distance <= 100,
          thresholdMeters: 100,
        },
        timeSequence: {
          durationMinutes: Math.round(durationMinutes),
          chronologicallyValid: afterTime > beforeTime,
        },
        sessionIntegrity: {
          sameSession: !!proof.sessionMetadata?.id,
          sessionId: proof.sessionMetadata?.id || '',
        },
      },
      
      // ISSUE 2: Add time window data
      ...(timeWindowData && { timeWindow: timeWindowData }),
      
      // EXTERNAL TIMESTAMP ANCHORING - Include real TSA token if present
...(proof.externalAnchor && {
  externalAnchor: {
    status: proof.externalAnchor.status,
    method: proof.externalAnchor.method,
    anchoredAt: proof.externalAnchor.anchoredAt,
    verification: proof.externalAnchor.verification,
    ...(proof.externalAnchor.method === 'tsa' ? {
      // Real RFC 3161 TSA data
      tsaUrl: proof.externalAnchor.tsaUrl,
      tsaName: proof.externalAnchor.tsaName,
      tokenData: proof.externalAnchor.tokenData,
      authenticatedTime: proof.externalAnchor.authenticatedTime,
      serialNumber: proof.externalAnchor.serialNumber,
      hashedValue: proof.externalAnchor.hashedValue,
      isValid: proof.externalAnchor.isValid,
    } : {}),
  },
}),
    },  // <-- This closes the 'proof' object
    
    platformMetadata: {
      exportFormat: 'json' as const,
      apiVersion: '1.0',
      certificationLevel: trustScore.total >= 90 ? 'certified' as const : trustScore.total >= 70 ? 'verified' as const : 'basic' as const,
      trustScore,
    },
    
    // ISSUE 4: Add audit trail
    ...(relevantAuditEvents.length > 0 && { auditTrail: relevantAuditEvents }),
  };
  
  return report;
}
/**
 * Generate human-readable PDF report content (HTML that can be converted to PDF)
 */
export function generatePDFContent(proof: ProofRecord, auditTrail?: any[]): string {
  const report = generateJSONReport(proof, auditTrail);
  const { proof: p, platformMetadata } = report;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Verification Report - ${p.verificationCode}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      color: #333;
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .title {
      font-size: 28px;
      font-weight: bold;
      color: #1f2937;
      margin-bottom: 10px;
    }
    .verification-code {
      font-size: 24px;
      font-family: monospace;
      color: #2563eb;
      background: #eff6ff;
      padding: 10px 15px;
      border-radius: 8px;
      display: inline-block;
      margin-top: 10px;
    }
    .trust-score {
      display: inline-block;
      background: ${platformMetadata.trustScore.total >= 90 ? '#10b981' : platformMetadata.trustScore.total >= 70 ? '#f59e0b' : '#ef4444'};
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: bold;
      margin-left: 15px;
    }
    .section {
      margin: 30px 0;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .section-title {
      font-size: 18px;
      font-weight: bold;
      color: #1f2937;
      margin-bottom: 15px;
      border-left: 4px solid #2563eb;
      padding-left: 12px;
    }
    .data-row {
      display: flex;
      padding: 10px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .data-label {
      font-weight: 600;
      color: #6b7280;
      width: 200px;
    }
    .data-value {
      color: #1f2937;
      font-family: monospace;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
    }
    .status-pass {
      background: #d1fae5;
      color: #065f46;
    }
    .status-fail {
      background: #fee2e2;
      color: #991b1b;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Work Verification Report</div>
    <div>${p.title}</div>
    <div class="verification-code">${p.verificationCode}</div>
    <span class="trust-score">Trust Score: ${platformMetadata.trustScore.total}/100</span>
  </div>

  <div class="section">
    <div class="section-title">Report Information</div>
    <div class="data-row">
      <div class="data-label">Report ID:</div>
      <div class="data-value">${report.reportId}</div>
    </div>
    <div class="data-row">
      <div class="data-label">Generated:</div>
      <div class="data-value">${new Date(report.generatedAt).toLocaleString()}</div>
    </div>
    <div class="data-row">
      <div class="data-label">Certification Level:</div>
      <div class="data-value">${platformMetadata.certificationLevel.toUpperCase()}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Trust Score Breakdown</div>
    <div class="data-row">
      <div class="data-label">Overall Score:</div>
      <div class="data-value"><strong>${platformMetadata.trustScore.total}/100</strong></div>
    </div>
    <div class="data-row">
      <div class="data-label">• Verification Code:</div>
      <div class="data-value">${platformMetadata.trustScore.breakdown.verificationCode}/20</div>
    </div>
    <div class="data-row">
      <div class="data-label">• Hash Integrity:</div>
      <div class="data-value">${platformMetadata.trustScore.breakdown.hashIntegrity}/30</div>
    </div>
    <div class="data-row">
      <div class="data-label">• Location Verification:</div>
      <div class="data-value">${platformMetadata.trustScore.breakdown.locationVerification}/20</div>
    </div>
    <div class="data-row">
      <div class="data-label">• Integrity Checks:</div>
      <div class="data-value">${platformMetadata.trustScore.breakdown.integrityChecks}/20</div>
    </div>
    <div class="data-row">
      <div class="data-label">• Session Integrity:</div>
      <div class="data-value">${platformMetadata.trustScore.breakdown.sessionIntegrity}/10</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Before Photo Verification</div>
    <div class="data-row">
      <div class="data-label">Timestamp:</div>
      <div class="data-value">${new Date(p.before.timestamp).toLocaleString()}</div>
    </div>
    <div class="data-row">
      <div class="data-label">GPS Location:</div>
      <div class="data-value">${p.before.location.latitude.toFixed(6)}, ${p.before.location.longitude.toFixed(6)}</div>
    </div>
    <div class="data-row">
      <div class="data-label">GPS Accuracy:</div>
      <div class="data-value">±${p.before.location.accuracy?.toFixed(1) || 'N/A'}m</div>
    </div>
    <div class="data-row">
      <div class="data-label">Image Hash:</div>
      <div class="data-value">${p.before.imageHash.substring(0, 32)}...</div>
    </div>
    <div class="data-row">
      <div class="data-label">Integrity Status:</div>
      <div class="data-value">
        <span class="status-badge ${p.before.integrity.edited ? 'status-fail' : 'status-pass'}">
          ${p.before.integrity.edited ? '⚠️ EDITED' : '✓ ORIGINAL'}
        </span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">After Photo Verification</div>
    <div class="data-row">
      <div class="data-label">Timestamp:</div>
      <div class="data-value">${new Date(p.after.timestamp).toLocaleString()}</div>
    </div>
    <div class="data-row">
      <div class="data-label">GPS Location:</div>
      <div class="data-value">${p.after.location.latitude.toFixed(6)}, ${p.after.location.longitude.toFixed(6)}</div>
    </div>
    <div class="data-row">
      <div class="data-label">GPS Accuracy:</div>
      <div class="data-value">±${p.after.location.accuracy?.toFixed(1) || 'N/A'}m</div>
    </div>
    <div class="data-row">
      <div class="data-label">Image Hash:</div>
      <div class="data-value">${p.after.imageHash.substring(0, 32)}...</div>
    </div>
    <div class="data-row">
      <div class="data-label">Integrity Status:</div>
      <div class="data-value">
        <span class="status-badge ${p.after.integrity.edited ? 'status-fail' : 'status-pass'}">
          ${p.after.integrity.edited ? '⚠️ EDITED' : '✓ ORIGINAL'}
        </span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Verification Results</div>
    <div class="data-row">
      <div class="data-label">Location Proximity:</div>
      <div class="data-value">
        ${p.verification.locationProximity.distanceMeters}m
        <span class="status-badge ${p.verification.locationProximity.withinThreshold ? 'status-pass' : 'status-fail'}">
          ${p.verification.locationProximity.withinThreshold ? '✓ WITHIN 100m' : '⚠️ EXCEEDS 100m'}
        </span>
      </div>
    </div>
    <div class="data-row">
      <div class="data-label">Time Duration:</div>
      <div class="data-value">${p.verification.timeSequence.durationMinutes} minutes</div>
    </div>
    <div class="data-row">
      <div class="data-label">Time Sequence:</div>
      <div class="data-value">
        <span class="status-badge ${p.verification.timeSequence.chronologicallyValid ? 'status-pass' : 'status-fail'}">
          ${p.verification.timeSequence.chronologicallyValid ? '✓ VALID' : '⚠️ INVALID'}
        </span>
      </div>
    </div>
    <div class="data-row">
      <div class="data-label">Session Integrity:</div>
      <div class="data-value">
        <span class="status-badge ${p.verification.sessionIntegrity.sameSession ? 'status-pass' : 'status-fail'}">
          ${p.verification.sessionIntegrity.sameSession ? '✓ SAME SESSION' : '⚠️ DIFFERENT SESSIONS'}
        </span>
      </div>
    </div>
  </div>

  <div class="footer">
    <p><strong>This is an automated verification report.</strong></p>
    <p>Report format version ${report.version} | API version ${platformMetadata.apiVersion}</p>
    <p>For verification, visit your platform with code: ${p.verificationCode}</p>
  </div>
</body>
</html>
  `;
}

/**
 * Download JSON report
 */
export function downloadJSON(proof: ProofRecord, filename?: string) {
  const report = generateJSONReport(proof);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `verification-${proof.verificationCode}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download PDF report (HTML version - can be printed to PDF)
 */
export function downloadPDF(proof: ProofRecord, filename?: string) {
  const html = generatePDFContent(proof);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `verification-${proof.verificationCode}.html`;
  a.click();
  URL.revokeObjectURL(url);
}