import { BorderRadius, Colors, Spacing, Typography } from '@/constants/uiTheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function OnboardingScreen() {
  const [isLoading, setIsLoading] = useState(false);

  const handleProceed = async () => {
    console.log('=== PROCEED BUTTON PRESSED ===');
    
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      // Set flag FIRST
      console.log('Saving onboarding state...');
      await AsyncStorage.setItem('hasOnboarded', 'true');
      console.log('Onboarding state saved');
      
      // Small delay to ensure AsyncStorage completes
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('Delay complete');
      
      // Then navigate (use replace, not navigate, for onboarding)
      console.log('Navigating to main app...');
      router.replace('/(tabs)');
      console.log('Navigation called');
      
    } catch (error) {
      console.error('Onboarding navigation error:', error);
      // Still navigate even if storage fails
      console.log('Error occurred, navigating anyway...');
      router.replace('/(tabs)');
    }
  };

  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoContainer}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>📸</Text>
        </View>
      </View>

      {/* Heading */}
      <Text style={styles.heading}>Welcome to{'\n'}BeforeAfter</Text>
      
      {/* Subheading */}
      <Text style={styles.subheading}>
        Professional work verification with{'\n'}cryptographic proof
      </Text>

      {/* Features List */}
      <View style={styles.featuresContainer}>
        <FeatureItem 
          icon="✓" 
          title="Verified Proof" 
          desc="GPS-tagged, time-locked evidence" 
        />
        <FeatureItem 
          icon="🔐" 
          title="Secure Hashing" 
          desc="Cryptographic integrity verification" 
        />
        <FeatureItem 
          icon="📋" 
          title="Legal Export" 
          desc="Court-admissible documentation" 
        />
      </View>

      {/* Primary CTA */}
      <TouchableOpacity 
        style={styles.primaryButton} 
        onPress={handleProceed}
        activeOpacity={0.8}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.background} />
        ) : (
          <Text style={styles.primaryButtonText}>PROCEED AHEAD</Text>
        )}
      </TouchableOpacity>

      {/* Footer */}
      <Text style={styles.footerText}>
        Your work evidence, securely verified
      </Text>
    </View>
  );
}

function FeatureItem({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl * 2,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  logoContainer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  
  logoBadge: {
    width: 120,
    height: 120,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  
  logoText: {
    fontSize: 60,
  },
  
  heading: {
    ...Typography.h1,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    lineHeight: 40,
  },
  
  subheading: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  
  featuresContainer: {
    width: '100%',
    gap: Spacing.lg,
    marginVertical: Spacing.xl,
  },
  
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  
  featureIcon: {
    fontSize: 24,
    marginTop: 2,
  },
  
  featureContent: {
    flex: 1,
  },
  
  featureTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    marginBottom: 2,
    fontWeight: '600',
  },
  
  featureDesc: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
  },
  
  primaryButton: {
    width: '100%',
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  
  primaryButtonText: {
    ...Typography.h3,
    color: Colors.background,
    fontWeight: '700',
    letterSpacing: 1,
  },
  
  footerText: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});