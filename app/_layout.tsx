import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useImportedProof } from '@/hooks/use-imported-proof';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const segments = useSegments();
  const router = useRouter();
  const importedProof = useImportedProof();

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
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

    const inHome = segments[0] === 'home';
    const inOnboarding = segments[0] === 'onboarding';
    const inTabs = segments[0] === '(tabs)';

    // Route flow:
    // Not onboarded → onboarding screen
    // Onboarded but not on home/tabs/client-verify → go to home
    // Fail-safe: Always allow staying on onboarding to prevent bypass loops
    if (!isOnboarded && !inOnboarding) {
      router.replace('/onboarding');
    }
    // FIX: Commented out auto-redirect to ensure user always sees the button
    // The user requested: "User MUST click 'Proceed Ahead' button to proceed. No auto-skip."
    /* else if (isOnboarded && !inHome && !inTabs && !inOnboarding && segments[0] !== 'client-verify' && segments[0] !== 'auto-verify' && segments[0] !== 'proof-display' && segments[0] !== 'proof') {
      router.replace('/home');
    } */
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
        <Stack.Screen name="home" />
        <Stack.Screen name="client-verify" />
        <Stack.Screen name="proof-display" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auto-verify" />
        <Stack.Screen name="proof" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}