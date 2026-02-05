import { Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { hashToVisualPattern, VisualPattern } from '../services/visualHashService';

interface ProofFingerprintProps {
  hash: string;              // The proof hash to visualize
  size?: number;             // Canvas size in pixels (default 200)
  showChecksum?: boolean;    // Show checksum badge (default true)
  style?: ViewStyle;         // Additional container styles
}

/**
 * ProofFingerprint Component
 * Displays a unique visual pattern generated from a cryptographic hash
 */
export const ProofFingerprint: React.FC<ProofFingerprintProps> = ({
  hash,
  size = 200,
  showChecksum = true,
  style,
}) => {
  // Generate pattern (memoized to prevent regeneration on re-renders)
  const pattern = useMemo(() => {
    try {
      return hashToVisualPattern(hash);
    } catch (error) {
      console.error('❌ [Fingerprint] Failed to generate pattern:', error);
      return null;
    }
  }, [hash]);

  if (!pattern) {
    return (
      <View style={[styles.container, { width: size, height: size }, style]}>
        <Text style={styles.errorText}>Invalid Hash</Text>
      </View>
    );
  }

  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Canvas style={{ width: size, height: size }}>
        <Group
          transform={[
            { translateX: center },
            { translateY: center },
            { rotate: (pattern.rotation * Math.PI) / 180 },
            { translateX: -center },
            { translateY: -center },
          ]}
        >
          {renderPattern(pattern, size)}
        </Group>
      </Canvas>

      {showChecksum && (
        <View style={styles.checksumBadge}>
          <Text style={styles.checksumText}>#{pattern.checksum}</Text>
        </View>
      )}
    </View>
  );
};

/**
 * Render the geometric pattern
 */
const renderPattern = (pattern: VisualPattern, size: number): React.ReactNode[] => {
  const center = size / 2;
  const elements: React.ReactNode[] = [];
  let elementKey = 0;

  // Draw concentric layers
  pattern.layers.forEach((segmentCount, layerIndex) => {
    const layerRadius = (size / 2.5) * ((layerIndex + 1) / pattern.layers.length);
    const color = pattern.colors[layerIndex % pattern.colors.length];

    // Draw symmetric segments around the circle
    for (let segment = 0; segment < pattern.symmetry; segment++) {
      const baseAngle = (segment * 360) / pattern.symmetry;
      
      // Create petal/segment path
      const path = createPetalPath(
        center,
        center,
        layerRadius,
        baseAngle,
        360 / pattern.symmetry,
        segmentCount
      );

      elements.push(
        <Path
          key={`layer-${elementKey++}`}
          path={path}
          color={color}
          style="stroke"
          strokeWidth={2}
          strokeCap="round"
          strokeJoin="round"
        />
      );
    }
  });

  // Add decorative circles at each layer
  pattern.layers.forEach((_, layerIndex) => {
    const layerRadius = (size / 2.5) * ((layerIndex + 1) / pattern.layers.length);
    const color = pattern.colors[layerIndex % pattern.colors.length];

    elements.push(
      <Circle
        key={`circle-${elementKey++}`}
        cx={center}
        cy={center}
        r={layerRadius}
        color={color}
        style="stroke"
        strokeWidth={1}
        opacity={0.3}
      />
    );
  });

  // Center dot
  elements.push(
    <Circle
      key="center-dot"
      cx={center}
      cy={center}
      r={6}
      color={pattern.colors[0]}
    />
  );

  return elements;
};

/**
 * Create a petal-shaped path
 */
const createPetalPath = (
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  angleSpan: number,
  complexity: number
): string => {
  const path = Skia.Path.Make();
  
  // Convert degrees to radians
  const startRad = (startAngle * Math.PI) / 180;
  const spanRad = (angleSpan * Math.PI) / 180;
  
  // Start at center
  path.moveTo(centerX, centerY);
  
  // Create curved petal shape
  const steps = complexity + 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startRad + spanRad * t;
    
    // Vary radius for petal effect
    const r = radius * (0.7 + 0.3 * Math.sin(t * Math.PI));
    
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);
    
    if (i === 0) {
      path.lineTo(x, y);
    } else {
      // Use quadratic curves for smooth petals
      const prevAngle = startRad + spanRad * ((i - 1) / steps);
      const prevR = radius * (0.7 + 0.3 * Math.sin(((i - 1) / steps) * Math.PI));
      const prevX = centerX + prevR * Math.cos(prevAngle);
      const prevY = centerY + prevR * Math.sin(prevAngle);
      
      const cpX = (prevX + x) / 2;
      const cpY = (prevY + y) / 2;
      
      path.quadTo(cpX, cpY, x, y);
    }
  }
  
  // Close path back to center
  path.close();
  
  return path.toSVGString();
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  checksumBadge: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  checksumText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  errorText: {
    color: '#999',
    fontSize: 14,
  },
});
