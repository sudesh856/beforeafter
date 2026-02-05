import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getWitnessCount } from '../lib/witnessDatabase';

interface WitnessBadgeProps {
  verificationCode: string;
  isTampered?: boolean;
}

export const WitnessBadge: React.FC<WitnessBadgeProps> = ({ verificationCode, isTampered = false }) => {
  const [witnessCount, setWitnessCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWitnessCount = async () => {
      try {
        console.log('🔍 WitnessBadge: Loading witness count for:', verificationCode);
        const count = await getWitnessCount(verificationCode);
        console.log('✅ WitnessBadge: Witness count loaded:', count, 'for', verificationCode);
        setWitnessCount(count);
      } catch (error) {
        console.warn('❌ WitnessBadge: Failed to load witness count:', error);
        setWitnessCount(0);
      } finally {
        setLoading(false);
      }
    };

    // Initial load
    loadWitnessCount();
    
    // Re-check after 2 seconds (to catch any sync updates)
    const refreshTimer = setTimeout(() => {
      console.log('🔄 WitnessBadge: Refreshing after 2 seconds to catch sync updates');
      loadWitnessCount();
    }, 2000);
    
    // Also refresh every 30 seconds to catch background syncs
    const intervalTimer = setInterval(() => {
      console.log('🔄 WitnessBadge: Periodic refresh to catch background syncs');
      loadWitnessCount();
    }, 30000);
    
    return () => {
      clearTimeout(refreshTimer);
      clearInterval(intervalTimer);
    };
  }, [verificationCode]);

  // Don't return null while loading - show "Local Only" immediately
  console.log('🔍 WitnessBadge rendering for:', verificationCode, 'witnessCount:', witnessCount, 'loading:', loading, 'isTampered:', isTampered);

  if (isTampered) {
    return (
      <View style={[styles.badge, styles.tamperedBadge]}>
        <Text style={styles.tamperedText}>❌ Tampered</Text>
      </View>
    );
  }

  if (witnessCount >= 3) {
    return (
      <View style={[styles.badge, styles.verifiedBadge]}>
        <Text style={styles.verifiedText}>✅ Network Verified ({witnessCount} witnesses)</Text>
      </View>
    );
  }

  if (witnessCount > 0) {
    return (
      <View style={[styles.badge, styles.limitedBadge]}>
        <Text style={styles.limitedText}>⚠️ Limited Verification ({witnessCount} witness{witnessCount > 1 ? 'es' : ''})</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.localBadge]}>
      <Text style={styles.localText}>📱 Local Only</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  verifiedBadge: {
    backgroundColor: '#d1fae5',
  },
  verifiedText: {
    color: '#065f46',
    fontSize: 13,
    fontWeight: '600',
  },
  limitedBadge: {
    backgroundColor: '#fef3c7',
  },
  limitedText: {
    color: '#92400e',
    fontSize: 13,
    fontWeight: '600',
  },
  localBadge: {
    backgroundColor: '#e5e7eb',
  },
  localText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  tamperedBadge: {
    backgroundColor: '#fee2e2',
  },
  tamperedText: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '600',
  },
});
