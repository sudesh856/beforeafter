import AsyncStorage from '@react-native-async-storage/async-storage';

const WITNESSES_KEY = 'beforeafter_witnesses';
const DEVICE_ID_KEY = 'witness_device_id';
const WITNESS_PROFILES_KEY = 'beforeafter_witness_profiles';

interface WitnessRecord {
  verificationCode: string;
  sessionId?: string;
  beforeHash: string;
  afterHash: string;
  timestamp: string;
  witnessedAt: number;
  witnessId?: string;
  witnessDeviceId?: string;
  creatorDeviceId?: string;
}

interface WitnessProfile {
  deviceId: string;
  totalWitnesses: number;
  witnessRank: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
  reliabilityScore: number;
  firstWitnessDate?: number;
  lastWitnessDate?: number;
  consecutiveDays: number;
  badges: string[];
}

/**
 * Get or create a persistent device ID for witness tracking
 * This ensures each device is uniquely identified and won't witness its own proofs
 */
export const getDeviceId = async (): Promise<string> => {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      // Generate new device ID if not stored
      deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
      console.log('🆔 New device ID generated:', deviceId);
    }
    return deviceId;
  } catch (error) {
    console.error('Error getting device ID:', error);
    // Fallback device ID if storage fails
    return `device-${Date.now()}-fallback`;
  }
}

/**
 * Initialize the witness database (no-op for AsyncStorage, but kept for API compatibility)
 */
export const initWitnessDatabase = async () => {
  try {
    const existing = await AsyncStorage.getItem(WITNESSES_KEY);
    if (!existing) {
      await AsyncStorage.setItem(WITNESSES_KEY, JSON.stringify([]));
    }
    
    // Initialize witness profiles
    const existingProfiles = await AsyncStorage.getItem(WITNESS_PROFILES_KEY);
    if (!existingProfiles) {
      await AsyncStorage.setItem(WITNESS_PROFILES_KEY, JSON.stringify({}));
    }
    
    console.log('✅ Witness database initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize witness database:', error);
    return false;
  }
};

/**
 * Get the witness database instance (no-op for AsyncStorage)
 */
export const getWitnessDatabase = () => {
  return null;
};

/**
 * Add or update a witnessed proof in the local storage
 * CRITICAL: Includes THREE checks to prevent duplicate witnessing:
 * 1. Don't witness your own proofs (creator check)
 * 2. Don't witness the same proof twice on this device (local duplicate check)
 * 3. Don't witness if already witnessed on Firebase (Firebase duplicate check)
 */
export const addWitness = async (proof: {
  verificationCode: string;
  sessionId?: string;
  beforeHash: string;
  afterHash: string;
  timestamp: string;
  creatorDeviceId?: string;
}) => {
  try {
    const deviceId = await getDeviceId();
    
    // CHECK 1: Don't witness your own proofs
    if (proof.creatorDeviceId && proof.creatorDeviceId === deviceId) {
      console.log(`⏭️ SKIPPING WITNESS: This device created proof ${proof.verificationCode}`);
      return true; // Return true to indicate operation succeeded (intentionally skipped)
    }
    
    // CHECK 2: Don't witness the same proof twice on this device (LOCAL check)
    const existing = await AsyncStorage.getItem(WITNESSES_KEY);
    const witnesses: WitnessRecord[] = existing ? JSON.parse(existing) : [];
    
    const alreadyWitnessedLocal = witnesses.some(
      w => w.verificationCode === proof.verificationCode && w.witnessDeviceId === deviceId
    );
    
    if (alreadyWitnessedLocal) {
      console.log(`⏭️ SKIPPING WITNESS: Already witnessed ${proof.verificationCode} on this device (local)`);
      return true; // Return true to indicate operation succeeded (intentionally skipped)
    }

    // CHECK 3: Don't witness if already witnessed on Firebase (FIREBASE check)
    // This handles the case where local data was cleared but Firebase still has the witness
    try {
      const { getDatabase, ref, get } = await import('firebase/database');
      const database = getDatabase();
      
      const firebaseWitnessRef = ref(database, `/witnesses/${proof.verificationCode}/${deviceId}`);
      const firebaseSnapshot = await get(firebaseWitnessRef);
      
      if (firebaseSnapshot.exists()) {
        console.log(`⏭️ SKIPPING WITNESS: Already witnessed ${proof.verificationCode} on Firebase (re-downloading)`);
        
        // Re-add to local database (was cleared but exists in Firebase)
        const witnessData = firebaseSnapshot.val();
        const restoredWitness: WitnessRecord = {
          verificationCode: proof.verificationCode,
          sessionId: proof.sessionId,
          beforeHash: proof.beforeHash,
          afterHash: proof.afterHash,
          timestamp: proof.timestamp,
          witnessId: witnessData.witnessId,
          witnessDeviceId: deviceId,
          creatorDeviceId: proof.creatorDeviceId,
          witnessedAt: witnessData.witnessedAt,
        };

        // Add the restored witness to local storage
        witnesses.push(restoredWitness);
        await AsyncStorage.setItem(WITNESSES_KEY, JSON.stringify(witnesses));
        
        console.log(`📥 Restored witness ${proof.verificationCode} from Firebase to local storage`);
        return true; // Return true to indicate operation succeeded (intentionally skipped)
      }
    } catch (firebaseError: any) {
      console.warn('⚠️ Failed to check Firebase for existing witness (offline?):', firebaseError.message);
      // Continue - if we can't check Firebase, proceed with local logic
    }
    
    // PASSED ALL THREE CHECKS - Add the witness
    const witnessId = `witness-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newWitness: WitnessRecord = {
      verificationCode: proof.verificationCode,
      sessionId: proof.sessionId,
      beforeHash: proof.beforeHash,
      afterHash: proof.afterHash,
      timestamp: proof.timestamp,
      witnessId,
      witnessDeviceId: deviceId, // Track which device witnessed
      creatorDeviceId: proof.creatorDeviceId, // Track creator for reference
      witnessedAt: Date.now(),
    };

    // Add to witnesses array
    witnesses.push(newWitness);

    // Save to AsyncStorage
    await AsyncStorage.setItem(WITNESSES_KEY, JSON.stringify(witnesses));

    // STEP 1B: UPLOAD TO FIREBASE (NEW CODE)
    try {
      const { getDatabase, ref, set } = await import('firebase/database');
      const database = getDatabase();
      
      await set(
        ref(database, `/witnesses/${proof.verificationCode}/${deviceId}`),
        {
          witnessId: witnessId,
          witnessDeviceId: deviceId,
          witnessedAt: newWitness.witnessedAt
        }
      );
      
      console.log('📤 Witness uploaded to Firebase');
      
    } catch (firebaseError: any) {
      console.warn('⚠️ Failed to upload witness to Firebase (offline?):', firebaseError.message);
      // Continue - witness is still stored locally
    }

    // Debug/logging for verification
    console.log('=== ✅ WITNESS ADDED (PASSED ALL CHECKS) ===');
    console.log('Verification Code:', proof.verificationCode);
    console.log('Witness Device ID:', deviceId);
    console.log('Witness ID:', witnessId);
    console.log('Total witnesses after add:', witnesses.length);

    // 🎮 NEW: Update witness profile stats
    await updateWitnessProfile(deviceId);

    return true;
  } catch (error) {
    console.warn('⚠️ Failed to add witness:', error);
    return false;
  }
};

/**
 * 🎮 NEW: Update witness profile with reputation tracking
 */
const updateWitnessProfile = async (deviceId: string) => {
  const now = Date.now();
  
  try {
    // Get existing profiles
    const profilesData = await AsyncStorage.getItem(WITNESS_PROFILES_KEY);
    const profiles: Record<string, WitnessProfile> = profilesData ? JSON.parse(profilesData) : {};
    
    const existingProfile = profiles[deviceId];
    
    if (!existingProfile) {
      // First witness - create profile
      const newProfile: WitnessProfile = {
        deviceId,
        totalWitnesses: 1,
        witnessRank: 'Bronze',
        reliabilityScore: 100.0,
        firstWitnessDate: now,
        lastWitnessDate: now,
        consecutiveDays: 1,
        badges: []
      };
      
      profiles[deviceId] = newProfile;
      await AsyncStorage.setItem(WITNESS_PROFILES_KEY, JSON.stringify(profiles));
      
      console.log('🎖️ Welcome! You are now a Bronze Witness (Level 1)');
    } else {
      // Increment count and update rank
      const newCount = existingProfile.totalWitnesses + 1;
      const newRank = calculateRank(newCount);
      const oldRank = existingProfile.witnessRank;
      
      const updatedProfile: WitnessProfile = {
        ...existingProfile,
        totalWitnesses: newCount,
        witnessRank: newRank,
        lastWitnessDate: now
      };
      
      profiles[deviceId] = updatedProfile;
      await AsyncStorage.setItem(WITNESS_PROFILES_KEY, JSON.stringify(profiles));
      
      if (newRank !== oldRank) {
        console.log(`🎉 RANK UP! You are now a ${newRank} Witness!`);
      }
      
      console.log(`✅ Total witnesses: ${newCount} (${newRank})`);
    }
  } catch (error) {
    console.warn('⚠️ Failed to update witness profile:', error);
  }
};

/**
 * 🎮 NEW: Calculate witness rank based on total witnesses
 */
const calculateRank = (count: number): 'Bronze' | 'Silver' | 'Gold' | 'Diamond' => {
  if (count >= 1000) return 'Diamond';
  if (count >= 100) return 'Gold';
  if (count >= 25) return 'Silver';
  return 'Bronze';
};

/**
 * Get witness count for a specific proof
 */
export const getWitnessCount = async (verificationCode: string): Promise<number> => {
  try {
    const existing = await AsyncStorage.getItem(WITNESSES_KEY);
    const witnesses: WitnessRecord[] = existing ? JSON.parse(existing) : [];

    return witnesses.filter(w => w.verificationCode === verificationCode).length;
  } catch (error) {
    console.warn('⚠️ Failed to get witness count:', error);
    return 0;
  }
};

/**
 * Get all witnessed proofs
 */
export const getAllWitnesses = async () => {
  try {
    const existing = await AsyncStorage.getItem(WITNESSES_KEY);
    const witnesses: WitnessRecord[] = existing ? JSON.parse(existing) : [];

    return witnesses.sort((a, b) => b.witnessedAt - a.witnessedAt);
  } catch (error) {
    console.warn('⚠️ Failed to get all witnesses:', error);
    return [];
  }
};

/**
 * Get a specific witnessed proof
 */
export const getWitness = async (verificationCode: string) => {
  try {
    const existing = await AsyncStorage.getItem(WITNESSES_KEY);
    const witnesses: WitnessRecord[] = existing ? JSON.parse(existing) : [];

    return witnesses.find(w => w.verificationCode === verificationCode) || null;
  } catch (error) {
    console.warn('⚠️ Failed to get witness:', error);
    return null;
  }
};

/**
 * Clear all witnesses from local storage
 */
export const clearAllWitnesses = async () => {
  try {
    await AsyncStorage.setItem(WITNESSES_KEY, JSON.stringify([]));
    console.log('🗑️ All local witnesses cleared');
    return true;
  } catch (error) {
    console.warn('⚠️ Failed to clear witnesses:', error);
    return false;
  }
};

/**
 * Get database statistics
 */
export const getWitnessDatabaseStats = async () => {
  try {
    const existing = await AsyncStorage.getItem(WITNESSES_KEY);
    const witnesses: WitnessRecord[] = existing ? JSON.parse(existing) : [];

    return { total: witnesses.length };
  } catch (error) {
    return { total: 0, error: String(error) };
  }
};

/**
 * 🎮 NEW: Get witness profile for current device
 */
export const getWitnessProfile = async (): Promise<WitnessProfile | null> => {
  try {
    const deviceId = await getDeviceId();
    const profilesData = await AsyncStorage.getItem(WITNESS_PROFILES_KEY);
    const profiles: Record<string, WitnessProfile> = profilesData ? JSON.parse(profilesData) : {};
    
    return profiles[deviceId] || null;
  } catch (error) {
    console.warn('⚠️ Failed to get witness profile:', error);
    return null;
  }
};
