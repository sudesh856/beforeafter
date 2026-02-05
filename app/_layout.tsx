import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useImportedProof } from '@/hooks/use-imported-proof';
import { initFirebaseOnStartup } from '@/lib/firebase';
import { initWitnessDatabase } from '@/lib/witnessDatabase';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const segments = useSegments();
  const router = useRouter();
  const importedProof = useImportedProof();

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        // Initialize witness database and Firebase on app startup
        await initWitnessDatabase();
        initFirebaseOnStartup();

        const hasOnboarded = await AsyncStorage.getItem('hasOnboarded');
        setIsOnboarded(hasOnboarded === 'true');
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        setIsOnboarded(false); // Default to not onboarded if error
      }
    };
    checkOnboarding();
  }, []);

  useEffect(() => {
    if (isOnboarded === null) return; // Still loading

    const inTabs = segments[0] === '(tabs)';

    // ONLY redirect if user has NOT onboarded and they're trying to access tabs
    if (!isOnboarded && inTabs) {
      router.replace('/onboarding');
    }
    // Don't redirect if they're already on onboarding - let them click the button!
  }, [isOnboarded, segments]);

  // Navigate to auto-verify screen when a proof is imported
  useEffect(() => {
    if (importedProof) {
      router.push({
        pathname: '/auto-verify',
        params: { proof: JSON.stringify(importedProof) }
      });
    }
  }, [importedProof, router]);

  if (isOnboarded === null) {
    return null; // Loading state
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auto-verify" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}