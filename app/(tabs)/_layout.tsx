import { Colors } from '@/constants/uiTheme';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useState } from 'react';
import { TouchableOpacity } from 'react-native';

export default function TabLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // Check which tab we're on
  // const isOnProofsTab = segments.length > 1 && (segments as string[])[1] === 'proofs'; // Unused

  // const handleBackPress = () => {
  //   // From Proofs → go to Capture tab
  //   router.push('/(tabs)');
  // }; // Unused

  // Define the tab bar style - ALWAYS visible, no collapsing
  // FIX: Removed conditional display logic that was hiding tabs
  const getTabBarStyle = () => ({
    display: 'flex' as 'flex',
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 65,
    paddingBottom: 10,
    paddingTop: 4,
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#1f2937',
          height: 70,
        },
        headerTitleStyle: {
          fontSize: 20,
          fontWeight: '600',
          color: '#fff',
        },
        headerLeft: () => (
          // Always show back button on all tabs to allow returning to Home
          <TouchableOpacity
            onPress={() => router.back()} // Simple back to previous screen
            style={{ marginLeft: 16, padding: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
        ),
        headerRight: () => null, // FIX: Remove collapse button to prevent accidental hiding
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textTertiary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'CAPTURE',
          headerTitle: 'Tabs',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="camera" size={size} color={color} />
          ),
          tabBarStyle: getTabBarStyle(),
        }}
      />
      <Tabs.Screen
        name="proofs"
        options={{
          title: 'PROOFS',
          headerTitle: 'Proofs',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" size={size} color={color} />
          ),
          tabBarStyle: getTabBarStyle(),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'SETTINGS',
          headerTitle: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
          tabBarStyle: getTabBarStyle(),
        }}
      />
      {/* Hide the explore tab */}
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}