/**
 * Proof Display Route Wrapper
 * 
 * This route is used by the Proofs tab to display a proof in worker mode
 * using the ProofDisplay component
 */

import { ProofDisplay } from '@/components/ProofDisplay';
import { ProofRecord } from '@/lib/proof';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    SafeAreaView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function ProofDisplayScreen() {
  const { proofId } = useLocalSearchParams<{ proofId: string }>();
  const router = useRouter();
  const [proof, setProof] = useState<ProofRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProof = async () => {
      try {
        if (!proofId) {
          setError('No proof ID provided');
          setLoading(false);
          return;
        }

        // Load proofs from AsyncStorage
        const stored = await AsyncStorage.getItem('proofs');
        if (!stored) {
          setError('No proofs found');
          setLoading(false);
          return;
        }

        const proofs: ProofRecord[] = JSON.parse(stored);
        const foundProof = proofs.find(p => p.id === proofId);

        if (!foundProof) {
          setError(`Proof ${proofId} not found`);
          setLoading(false);
          return;
        }

        setProof(foundProof);
        setError(null);
      } catch (err) {
        console.error('Error loading proof:', err);
        setError('Failed to load proof');
      } finally {
        setLoading(false);
      }
    };

    loadProof();
  }, [proofId]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 20, color: '#dc2626' }}>
            {error}
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: '#4CAF50',
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 8,
            }}
            onPress={() => router.back()}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!proof) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </SafeAreaView>
    );
  }

  // Convert ProofRecord to ProofObject format for ProofDisplay
  const proofObject = {
    proofId: proof.id,
    workerId: 'WORKER_LOCAL',
    status: 'completed',
    createdAt: proof.createdAt,
    deviceName: proof.deviceName,
    platform: proof.platform,
    algorithmVersion: proof.algorithmVersion,
    before: {
      timestamp: proof.beforeTimestamp || proof.createdAt,
      imageHash: proof.beforeHash,
      gps: {
        lat: proof.beforeLocation?.latitude || 0,
        lon: proof.beforeLocation?.longitude || 0,
      },
      imageUri: proof.beforeUri,
    },
    after: {
      timestamp: proof.afterTimestamp || proof.createdAt,
      imageHash: proof.afterHash,
      gps: {
        lat: proof.afterLocation?.latitude || 0,
        lon: proof.afterLocation?.longitude || 0,
      },
      imageUri: proof.afterUri,
    },
  };

  return (
    <ProofDisplay
      proof={proofObject}
      mode="worker"
    />
  );
}

