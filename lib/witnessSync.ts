import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchNetworkProofs } from './firebase';
import { addWitness, getAllWitnesses, getWitnessDatabaseStats } from './witnessDatabase';

let isSyncing = false;
let syncInterval: NodeJS.Timeout | null = null;

/**
 * Sync all network proofs from Firebase to local witness database
 * This pulls proof metadata from other devices into our local witness store
 */
export const syncWitnesses = async () => {
  // Prevent concurrent syncs
  if (isSyncing) {
    console.log('ℹ️ Sync already in progress');
    return;
  }

  isSyncing = true;

  try {
    const networkProofs = await fetchNetworkProofs();
    
    if (!networkProofs || Object.keys(networkProofs).length === 0) {
      console.log('ℹ️ No network proofs to sync');
      isSyncing = false;
      return;
    }

    let syncedCount = 0;
    for (const [verificationCode, proof] of Object.entries(networkProofs)) {
      const proofData = proof as any;
      
      try {
        const success = await addWitness({
          verificationCode: proofData.verificationCode,
          sessionId: proofData.sessionId,
          beforeHash: proofData.beforeHash,
          afterHash: proofData.afterHash,
          timestamp: proofData.timestamp,
          creatorDeviceId: proofData.creatorDeviceId, // WITNESS DEDUPLICATION - Pass creator info
        });

        if (success) {
          syncedCount++;
        }
      } catch (error) {
        console.warn(`⚠️ Failed to sync proof ${verificationCode}:`, error);
      }
    }

    if (syncedCount > 0) {
      const stats = await getWitnessDatabaseStats();
      console.log(`✅ Synced ${syncedCount} new proofs. Total witnesses: ${stats.total}`);
    } else {
      console.log('ℹ️ All network proofs already witnessed');
    }

    // NEW CODE: Download witness records from Firebase
    console.log('📥 Downloading witness records from Firebase...');
    
    try {
      const { getDatabase, ref, get } = await import('firebase/database');
      const database = getDatabase();
      
      const witnessesSnapshot = await get(ref(database, '/witnesses'));
      const allFirebaseWitnesses = witnessesSnapshot.val() || {};
      
      // Merge Firebase witnesses with local witnesses
      const localWitnesses = await getAllWitnesses();
      const localWitnessMap = new Map(
        localWitnesses.map((w: any) => [`${w.verificationCode}-${w.witnessDeviceId}`, w])
      );
      
      let newWitnessCount = 0;
      
      for (const [verificationCode, deviceWitnesses] of Object.entries(allFirebaseWitnesses)) {
        for (const [deviceId, witnessData] of Object.entries(deviceWitnesses as any)) {
          const key = `${verificationCode}-${deviceId}`;
          
          // If we don't have this witness locally, add it
          if (!localWitnessMap.has(key)) {
            const witness = {
              verificationCode: verificationCode,
              witnessId: (witnessData as any).witnessId,
              witnessDeviceId: (witnessData as any).witnessDeviceId,
              witnessedAt: (witnessData as any).witnessedAt,
              // Note: We don't have full proof data for Firebase witnesses,
              // but we have enough to count them
              beforeHash: '',
              afterHash: '',
              sessionId: '',
              timestamp: ''
            };
            
            localWitnesses.push(witness);
            newWitnessCount++;
            console.log(`📥 Downloaded witness from device ${deviceId} for proof ${verificationCode}`);
          }
        }
      }
      
      // Save merged witnesses locally
      await AsyncStorage.setItem('beforeafter_witnesses', JSON.stringify(localWitnesses));
      
      if (newWitnessCount > 0) {
        console.log(`✅ Downloaded ${newWitnessCount} new witnesses from Firebase. Total: ${localWitnesses.length}`);
      } else {
        console.log('ℹ️ No new witnesses from Firebase');
      }
      
    } catch (firebaseError: any) {
      console.warn('⚠️ Failed to download witnesses from Firebase:', firebaseError.message);
      // Continue - witness sync for proofs still worked
    }
  } catch (error) {
    console.warn('⚠️ Witness sync failed:', error);
  } finally {
    isSyncing = false;
  }
};

/**
 * Start periodic witness syncing (every 30 minutes)
 * Call this once during app initialization
 */
export const startPeriodicSync = () => {
  // Initial sync immediately
  syncWitnesses();

  // Then sync every 30 minutes
  syncInterval = setInterval(syncWitnesses, 30 * 60 * 1000) as any;
  
  console.log('📡 Witness sync scheduled every 30 minutes');
};

/**
 * Stop periodic syncing
 */
export const stopPeriodicSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('⏹️  Witness sync stopped');
  }
};

/**
 * Perform a manual sync immediately
 */
export const manualSync = async () => {
  console.log('🔄 Manual witness sync requested');
  await syncWitnesses();
};

/**
 * Get current sync status
 */
export const getSyncStatus = () => {
  return {
    isSyncing,
    isScheduled: syncInterval !== null,
  };
};
