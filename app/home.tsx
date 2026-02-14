/**
 * Home Screen - User Role Selection
 * 
 * First screen after onboarding
 * Two equal-prominence buttons for worker and client flows
 */

import { useRouter } from 'expo-router';
import React from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  const handleWorkerFlow = () => {
    router.push('/(tabs)');
  };

  const handleClientFlow = () => {
    router.push('/client-verify');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.innerContainer}>
          {/* Logo/Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>🔐</Text>
            </View>
            <Text style={styles.title}>BeforeAfter</Text>
            <Text style={styles.tagline}>
              Cryptographically verified work proof
            </Text>
          </View>

          {/* Description */}
          <View style={styles.description}>
            <Text style={styles.descriptionText}>
              Secure work verification with built-in cryptographic signatures. Workers capture before/after evidence. Clients verify authenticity with a PIN.
            </Text>
          </View>

          {/* Buttons Container */}
          <View style={styles.buttonsContainer}>
            {/* Worker Button */}
            <TouchableOpacity
              style={styles.button}
              onPress={handleWorkerFlow}
              activeOpacity={0.85}
            >
              <View style={styles.workerButton}>
                <Text style={styles.buttonIcon}>👷</Text>
                <Text style={styles.buttonTitle}>I'M A WORKER</Text>
                <Text style={styles.buttonDescription}>
                  Capture before/after photos, sign proof, share PIN
                </Text>
              </View>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Client Button */}
            <TouchableOpacity
              style={styles.button}
              onPress={handleClientFlow}
              activeOpacity={0.85}
            >
              <View style={styles.clientButton}>
                <Text style={styles.buttonIcon}>🔍</Text>
                <Text style={styles.buttonTitle}>I'M A CLIENT</Text>
                <Text style={styles.buttonDescription}>
                  Enter PIN, verify proof authenticity
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Features */}
          <View style={styles.features}>
            <FeatureRow icon="✓" title="Cryptographic Verification" />
            <FeatureRow icon="🔒" title="Secure & Sandboxed" />
            <FeatureRow icon="📍" title="GPS-Tagged Evidence" />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              All data encrypted. No accounts needed.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureRow({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    flexGrow: 1,
  },
  innerContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
    justifyContent: 'space-between',
  },

  // Header
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF5015',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Description
  description: {
    marginBottom: 32,
  },
  descriptionText: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
  },

  // Buttons
  buttonsContainer: {
    marginBottom: 32,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },

  button: {
    flex: 1,
  },

  workerButton: {
    backgroundColor: '#fff',
    padding: 20,
    alignItems: 'center',
  },
  clientButton: {
    backgroundColor: '#fff',
    padding: 20,
    alignItems: 'center',
  },

  buttonIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  buttonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  buttonDescription: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },

  divider: {
    height: 1,
    backgroundColor: '#eee',
  },

  // Features
  features: {
    marginBottom: 24,
    paddingVertical: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 28,
  },
  featureTitle: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
    marginTop: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
