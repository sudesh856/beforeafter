/**
 * USER-DECLARED TIME WINDOW ENFORCEMENT UTILITY
 * 
 * Handles:
 * - Monotonic time measurement for elapsed time tracking
 * - Clock change detection
 * - App lifecycle anomaly detection
 * - Time window validation
 */

import { TimeAnomaly } from './proof';

// Global state for monotonic time tracking
let sessionStartMonotonicMs: number | null = null;
let sessionStartSystemClockMs: number | null = null;
let lastSystemClockMs: number | null = null;
let detectedAnomalies: TimeAnomaly[] = [];

/**
 * Get a monotonic time value (always increasing, not affected by system clock changes)
 * Falls back to performance.now() if available, otherwise Date.now() with drift detection
 */
export const getMonotonicTimeMs = (): number => {
  // Prefer performance.now() which is always monotonic
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  // Fallback to Date.now() with clock change detection
  return Date.now();
};

/**
 * Initialize monotonic time tracking for a new session
 * Must be called when "Before" photo is taken
 */
export const initializeTimeTracking = (): {
  monoMs: number;
  sysMs: number;
} => {
  sessionStartMonotonicMs = getMonotonicTimeMs();
  sessionStartSystemClockMs = Date.now();
  lastSystemClockMs = sessionStartSystemClockMs;
  detectedAnomalies = [];

  return {
    monoMs: sessionStartMonotonicMs,
    sysMs: sessionStartSystemClockMs,
  };
};

/**
 * Get elapsed time using monotonic clock
 * Returns elapsed time in milliseconds since session started
 */
export const getElapsedMonotonicMs = (): number | null => {
  if (sessionStartMonotonicMs === null) {
    return null;
  }
  return getMonotonicTimeMs() - sessionStartMonotonicMs;
};

/**
 * Detect clock tampering / anomalies
 * Returns detected anomaly or null if no issue
 */
export const detectClockAnomaly = (sessionId: string): TimeAnomaly | null => {
  if (sessionStartSystemClockMs === null || lastSystemClockMs === null) {
    return null;
  }

  const currentSystemClockMs = Date.now();
  const clockDrift = currentSystemClockMs - lastSystemClockMs;

  // If clock went backwards or jumped more than 5 seconds, flag it
  if (clockDrift < -1000 || clockDrift > 5000) {
    const anomaly: TimeAnomaly = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      sessionId,
      anomalyType: 'clock_change_detected',
      details: `System clock drift detected: ${clockDrift}ms (expected ~0ms)`,
      timeSourceAtEvent: 'system_clock',
    };

    detectedAnomalies.push(anomaly);
    lastSystemClockMs = currentSystemClockMs;
    return anomaly;
  }

  lastSystemClockMs = currentSystemClockMs;
  return null;
};

/**
 * Validate elapsed time against time window constraints
 */
export const validateTimeWindow = (
  elapsedMs: number,
  minTimeMs: number,
  maxTimeMs: number
): {
  isValid: boolean;
  status: 'VALID' | 'INVALID' | 'EXPIRED';
  remainingMs: number;
  reason: string;
} => {
  if (elapsedMs < minTimeMs) {
    const remaining = minTimeMs - elapsedMs;
    return {
      isValid: false,
      status: 'INVALID',
      remainingMs: remaining,
      reason: `Minimum time window not met. Available in ${(remaining / 1000).toFixed(1)}s`,
    };
  }

  if (elapsedMs > maxTimeMs) {
    return {
      isValid: true,
      status: 'EXPIRED',
      remainingMs: 0,
      reason: 'Time window expired – session evidence void',
    };
  }

  return {
    isValid: true,
    status: 'VALID',
    remainingMs: 0,
    reason: 'Time window valid – capture allowed',
  };
};

/**
 * Get all detected anomalies during session
 */
export const getDetectedAnomalies = (): TimeAnomaly[] => {
  return [...detectedAnomalies];
};

/**
 * Record an anomaly event (app background, foreground, reboot suspicion, etc.)
 */
export const recordTimeAnomaly = (
  sessionId: string,
  anomalyType: TimeAnomaly['anomalyType'],
  details: string
): TimeAnomaly => {
  const anomaly: TimeAnomaly = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    sessionId,
    anomalyType,
    details,
    timeSourceAtEvent: sessionStartMonotonicMs !== null ? 'monotonic' : 'system_clock',
  };

  detectedAnomalies.push(anomaly);
  return anomaly;
};

/**
 * Reset time tracking (call after session completes)
 */
export const resetTimeTracking = (): void => {
  sessionStartMonotonicMs = null;
  sessionStartSystemClockMs = null;
  lastSystemClockMs = null;
  detectedAnomalies = [];
};

/**
 * Get time source used for this session
 */
export const getTimeSource = (): 'monotonic' | 'system_clock' => {
  // Check if we can use performance.now() (monotonic)
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return 'monotonic';
  }
  return 'system_clock';
};

/**
 * Format time duration for human display
 */
export const formatTimeRemaining = (ms: number): string => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
};
