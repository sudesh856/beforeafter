import { initializeApp } from 'firebase/app';
import { get, getDatabase, ref, remove, set } from 'firebase/database';

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyB1m7esE1Tdjv6dH9HfJvdt3_U_c9kswL0',
  authDomain: 'beforeafter-273dd.firebaseapp.com',
  databaseURL: 'https://beforeafter-273dd-default-rtdb.firebaseio.com',
  projectId: 'beforeafter-273dd',
  storageBucket: 'beforeafter-273dd.firebasestorage.app',
  messagingSenderId: '742516347023',
  appId: '1:742516347023:web:52f2f62b8065c1920120fa',
};

let firebaseApp: ReturnType<typeof initializeApp> | null = null;
let firebaseDatabase: ReturnType<typeof getDatabase> | null = null;

/**
 * Initialize Firebase app
 * Safe to call multiple times - returns cached instance
 */
export const initializeFirebase = () => {
  try {
    if (!firebaseApp) {
      firebaseApp = initializeApp(firebaseConfig);
      firebaseDatabase = getDatabase(firebaseApp);
      console.log('✅ Firebase initialized');
    }
    return firebaseApp;
  } catch (error) {
    console.warn('⚠️ Firebase initialization failed (may be offline)', error);
    return null;
  }
};

/**
 * Get Firebase database instance
 */
export const getFirebaseDatabase = () => {
  if (!firebaseDatabase) {
    initializeFirebase();
  }
  return firebaseDatabase;
};

/**
 * Upload proof metadata to Firebase network
 * Only stores cryptographic data (hashes, timestamps, verification code)
 * NOT the actual photo files
 */
export const uploadProofMetadata = async (proofMetadata: {
  verificationCode: string;
  sessionId: string;
  beforeHash: string;
  afterHash: string;
  timestamp: string;
  creatorDeviceId?: string;
}) => {
  try {
    const database = getFirebaseDatabase();
    if (!database) {
      console.warn('⚠️ Firebase database not available (offline?)');
      return false;
    }

    const proofRef = ref(database, `/proofs/${proofMetadata.verificationCode}`);
    
    // Check if this proof already exists
    const existing = await get(proofRef);
    if (existing.exists()) {
      console.log(`ℹ️ Proof ${proofMetadata.verificationCode} already registered`);
      return true;
    }

    // Upload metadata
    await set(proofRef, {
      ...proofMetadata,
      creatorDeviceId: proofMetadata.creatorDeviceId, // Track which device created this proof
      createdAt: Date.now(),
    });

    console.log('✅ Proof metadata uploaded to network:', proofMetadata.verificationCode);
    return true;
  } catch (error) {
    console.warn('⚠️ Failed to upload proof metadata:', error);
    return false;
  }
};

/**
 * Fetch all proofs from Firebase network
 */
export const fetchNetworkProofs = async () => {
  try {
    const database = getFirebaseDatabase();
    if (!database) {
      console.warn('⚠️ Firebase database not available (offline?)');
      return {};
    }

    const proofsRef = ref(database, '/proofs');
    const snapshot = await get(proofsRef);
    
    if (!snapshot.exists()) {
      return {};
    }

    return snapshot.val() || {};
  } catch (error) {
    console.warn('⚠️ Failed to fetch network proofs:', error);
    return {};
  }
};

/**
 * Clear all Firebase proof data (admin/debug function)
 * FIXED: Only deletes proofs created by this device + deletes witnesses too
 */
export const clearAllFirebaseData = async (): Promise<{ deletedCount: number; skippedCount: number }> => {
  try {
    // 🔧 [Clear Network Data] Device ID:
    const { getDeviceId } = await import('./witnessDatabase');
    const diagnosticDeviceId = await getDeviceId();
    console.log('🔧 [Clear Network Data] Device ID:', diagnosticDeviceId);
    
    const database = getFirebaseDatabase();
    if (!database) {
      console.warn('⚠️ Firebase database not available');
      return { deletedCount: 0, skippedCount: 0 };
    }

    // Get this device's ID to check permissions
    const deviceId = await getDeviceId();

    // Get local proofs to check which ones this device created
    const AsyncStorage = await import('@react-native-async-storage/async-storage');
    const storedProofs = await AsyncStorage.default.getItem('proofs');
    const localProofs = storedProofs ? JSON.parse(storedProofs) : [];

    let deletedCount = 0;
    let skippedCount = 0;

    // Delete proofs one by one with permission check
    for (const proof of localProofs) {
      // CHECK: Only delete if THIS device created the proof
      if (proof.creatorDeviceId === deviceId) {
        await remove(ref(database, `/proofs/${proof.verificationCode}`));
        await remove(ref(database, `/witnesses/${proof.verificationCode}`)); // Also delete witnesses!
        deletedCount++;
        console.log(`🗑️ Deleted proof ${proof.verificationCode} and its witnesses from Firebase`);
      } else {
        // Skip proofs created by other devices
        console.log(`⏭️ SKIPPING: Cannot delete proof ${proof.verificationCode} - created by another device`);
        skippedCount++;
      }
    }
    
    console.log(`🗑️ Firebase data cleared: ${deletedCount} proof(s) deleted, ${skippedCount} proof(s) skipped`);
    return { deletedCount, skippedCount };
  } catch (error) {
    console.error('❌ Failed to clear Firebase data:', error);
    return { deletedCount: 0, skippedCount: 0 };
  }
};

/**
 * Initialize Firebase on app startup
 */
export const initFirebaseOnStartup = () => {
  initializeFirebase();
};
