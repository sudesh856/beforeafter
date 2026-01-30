/**
 * Device ID Management
 * 
 * Generates a persistent, stable device identifier and stores it for reuse.
 * This ensures consistent device identification across app sessions and exports.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const DEVICE_ID_STORAGE_KEY = 'app_device_id';

/**
 * Generate a deterministic device identifier from platform and device info
 * Falls back to UUID if needed
 */
async function generateDeviceId(): Promise<string> {
  try {
    // Try to create a composite ID from device information
    const modelId = Device.modelId || 'unknown';
    const osInternalBuildId = Device.osInternalBuildId || 'unknown';
    const timestamp = Date.now().toString();
    
    // Create a SHA256 hash of device components for a stable, unique ID
    const input = `${Platform.OS}-${modelId}-${osInternalBuildId}`;
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      input
    );
    
    // Use first 16 characters (128 bits) for device ID
    return `DEV-${hash.substring(0, 16).toUpperCase()}`;
  } catch (error) {
    console.error('Error generating device ID:', error);
    // Fallback to simple UUID-like ID
    return `DEV-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  }
}

/**
 * Get or create a persistent device ID
 * First call generates and stores it, subsequent calls return the same ID
 */
export async function getPersistentDeviceId(): Promise<string> {
  try {
    // Try to get existing device ID from storage
    const stored = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored) {
      return stored;
    }
    
    // Generate new device ID if not stored
    const newId = await generateDeviceId();
    
    // Persist it for future use
    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, newId);
    
    return newId;
  } catch (error) {
    console.error('Error getting persistent device ID:', error);
    // Final fallback
    return `DEV-${Date.now()}`;
  }
}

/**
 * Reset device ID (for testing purposes only)
 */
export async function resetDeviceId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEVICE_ID_STORAGE_KEY);
  } catch (error) {
    console.error('Error resetting device ID:', error);
  }
}
