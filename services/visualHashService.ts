/**
 * Visual Hash Service
 * Converts cryptographic hashes into unique visual patterns
 * 100% deterministic - same hash always produces same pattern
 */

export interface VisualPattern {
  layers: number[];        // Number of segments in each concentric layer
  colors: string[];        // Color palette derived from hash
  rotation: number;        // Overall rotation in degrees
  symmetry: number;        // Fold symmetry (2-8)
  checksum: string;        // 3-digit visual checksum
  seed: number;           // Random seed for pattern generation
}

/**
 * Main function: Convert hash string to visual pattern
 * @param hash - Hexadecimal hash string (e.g., "8941eaf49fae...")
 * @returns VisualPattern object
 */
export const hashToVisualPattern = (hash: string): VisualPattern => {
  console.log('🎨 [VisualHash] Generating pattern for hash:', hash.substring(0, 16) + '...');
  
  // Convert hash to byte array
  const bytes = hashToBytes(hash);
  
  if (bytes.length < 16) {
    console.error('❌ [VisualHash] Hash too short:', hash);
    throw new Error('Invalid hash: must be at least 32 characters');
  }
  
  // Generate pattern components from hash bytes
  const pattern: VisualPattern = {
    // Use first 6 bytes for layer structure (0-7 segments per layer)
    layers: bytes.slice(0, 6).map(b => (b % 8) + 1), // 1-8 segments
    
    // Extract color palette from bytes 6-11
    colors: extractColors(bytes.slice(6, 12)),
    
    // Rotation from byte 12 (0-359 degrees)
    rotation: bytes[12] % 360,
    
    // Symmetry from byte 13 (2-8 fold)
    symmetry: (bytes[13] % 7) + 2,
    
    // Checksum from sum of all bytes
    checksum: calculateChecksum(bytes),
    
    // Seed for additional randomness
    seed: (bytes[14] << 8) | bytes[15],
  };
  
  console.log('✅ [VisualHash] Pattern generated:', {
    layers: pattern.layers.length,
    symmetry: pattern.symmetry,
    checksum: pattern.checksum
  });
  
  return pattern;
};

/**
 * Convert hexadecimal hash string to byte array
 * @param hash - Hex string
 * @returns Array of numbers (0-255)
 */
const hashToBytes = (hash: string): number[] => {
  const bytes: number[] = [];
  
  // Remove any non-hex characters
  const cleanHash = hash.replace(/[^0-9a-fA-F]/g, '');
  
  // Convert pairs of hex digits to bytes
  for (let i = 0; i < cleanHash.length; i += 2) {
    const byte = parseInt(cleanHash.substring(i, i + 2), 16);
    if (!isNaN(byte)) {
      bytes.push(byte);
    }
  }
  
  return bytes;
};

/**
 * Extract color palette from hash bytes
 * Creates harmonious colors using HSL color space
 * @param bytes - Array of 6 bytes
 * @returns Array of 3 HSL color strings
 */
const extractColors = (bytes: number[]): string[] => {
  // Base hue from first byte (0-359)
  const baseHue = (bytes[0] / 255) * 360;
  
  // Create triadic color scheme (120 degrees apart)
  return [
    `hsl(${Math.round(baseHue)}, 75%, 55%)`,                    // Primary
    `hsl(${Math.round((baseHue + 120) % 360)}, 75%, 45%)`,     // Secondary
    `hsl(${Math.round((baseHue + 240) % 360)}, 75%, 65%)`,     // Tertiary
  ];
};

/**
 * Calculate visual checksum for quick comparison
 * @param bytes - Full byte array
 * @returns 3-digit string (e.g., "247")
 */
const calculateChecksum = (bytes: number[]): string => {
  const sum = bytes.reduce((acc, byte) => acc + byte, 0);
  const checksum = sum % 1000;
  return checksum.toString().padStart(3, '0');
};

/**
 * Compare two hashes visually
 * @param hash1 - First hash
 * @param hash2 - Second hash
 * @returns true if patterns match
 */
export const compareVisualPatterns = (hash1: string, hash2: string): boolean => {
  const pattern1 = hashToVisualPattern(hash1);
  const pattern2 = hashToVisualPattern(hash2);
  
  return pattern1.checksum === pattern2.checksum;
};

/**
 * Get pattern similarity percentage (for debugging)
 * @param hash1 - First hash
 * @param hash2 - Second hash
 * @returns Similarity percentage (0-100)
 */
export const getPatternSimilarity = (hash1: string, hash2: string): number => {
  const pattern1 = hashToVisualPattern(hash1);
  const pattern2 = hashToVisualPattern(hash2);
  
  let matches = 0;
  let total = 0;
  
  // Compare layer structure
  const minLayers = Math.min(pattern1.layers.length, pattern2.layers.length);
  for (let i = 0; i < minLayers; i++) {
    total++;
    if (pattern1.layers[i] === pattern2.layers[i]) matches++;
  }
  
  // Compare symmetry
  total++;
  if (pattern1.symmetry === pattern2.symmetry) matches++;
  
  // Compare rotation (within 10 degrees)
  total++;
  if (Math.abs(pattern1.rotation - pattern2.rotation) < 10) matches++;
  
  return Math.round((matches / total) * 100);
};
