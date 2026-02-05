// Test script to verify Firebase witness syncing functionality
// This would be run in a React Native environment

import { addWitness } from './lib/witnessDatabase';
import { syncWitnesses } from './lib/witnessSync';

// Test data
const testProof = {
  verificationCode: 'BA-2026-TEST123',
  sessionId: 'test-session-123',
  beforeHash: 'abc123',
  afterHash: 'def456',
  timestamp: '2026-02-02T19:03:00Z',
  creatorDeviceId: 'device-test-creator'
};

async function testWitnessSync() {
  console.log('=== TESTING FIREBASE WITNESS SYNC ===');
  
  try {
    // Test 1: Add a witness (should upload to Firebase)
    console.log('\n🧪 Test 1: Adding witness...');
    const result = await addWitness(testProof);
    console.log('Add witness result:', result);
    
    // Test 2: Sync witnesses (should download from Firebase)
    console.log('\n🧪 Test 2: Syncing witnesses...');
    await syncWitnesses();
    
    console.log('\n✅ Tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export for use in the app
export { testWitnessSync };
