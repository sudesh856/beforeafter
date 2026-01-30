// radiusEnforcement.ts
// Drop this into your existing codebase - no core changes needed

export interface LocationPoint {
  latitude: number;
  longitude: number;
}

export interface RadiusConfig {
  center: LocationPoint;
  radiusMeters: number;
  enforcementEnabled: boolean;
}

export interface RadiusValidationResult {
  isValid: boolean;
  distanceMeters: number;
  radiusMeters: number;
  errorMessage?: string;
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  point1: LocationPoint,
  point2: LocationPoint
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (point1.latitude * Math.PI) / 180;
  const φ2 = (point2.latitude * Math.PI) / 180;
  const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Validate if a photo location is within the allowed radius
 */
export function validateRadius(
  photoLocation: LocationPoint,
  config: RadiusConfig
): RadiusValidationResult {
  if (!config.enforcementEnabled) {
    return {
      isValid: true,
      distanceMeters: 0,
      radiusMeters: config.radiusMeters,
    };
  }

  const distance = calculateDistance(photoLocation, config.center);
  const isValid = distance <= config.radiusMeters;

  return {
    isValid,
    distanceMeters: Math.round(distance),
    radiusMeters: config.radiusMeters,
    errorMessage: isValid
      ? undefined
      : `Photo taken ${Math.round(distance)}m from job site. Must be within ${config.radiusMeters}m.`,
  };
}


