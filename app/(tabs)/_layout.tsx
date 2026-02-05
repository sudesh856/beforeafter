import { Colors } from '@/constants/uiTheme';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';

export default function TabLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // Check which tab we're on
  const isOnProofsTab = segments[1] === 'proofs';

  const handleBackPress = () => {
    // From Proofs → go to Capture tab
    router.push('/(tabs)');
  };

  // Define the tab bar style that responds to state - with proper typing
  const getTabBarStyle = () => ({
    display: (isCollapsed ? 'none' : 'flex') as 'none' | 'flex',
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
          // Only show back button on Proofs tab
          isOnProofsTab ? (
            <TouchableOpacity
              onPress={handleBackPress}
              style={{ marginLeft: 16, padding: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ) : null
        ),
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setIsCollapsed(!isCollapsed)}
            style={{ 
              marginRight: 16, 
              padding: 8,
              minHeight: 44,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ 
              fontSize: 28, 
              color: '#9ca3af', 
              fontWeight: '600',
              lineHeight: 32,
            }}>
              {isCollapsed ? '↓' : '↑'}
            </Text>
          </TouchableOpacity>
        ),
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