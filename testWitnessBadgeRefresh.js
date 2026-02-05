// Test script to verify WitnessBadge refresh functionality
// This would be run in a React Native environment

import React from 'react';
import { WitnessBadge } from './components/WitnessBadge';

// Test component to verify WitnessBadge refresh
const TestWitnessBadgeRefresh = () => {
  const testVerificationCode = 'BA-2026-TEST123';
  
  return (
    <div style={{ padding: 20 }}>
      <h2>Testing WitnessBadge Refresh</h2>
      
      <h3>Initial State (should show "Local Only")</h3>
      <WitnessBadge verificationCode={testVerificationCode} />
      
      <p>
        <strong>Expected behavior:</strong>
      </p>
      <ol>
        <li>Badge should initially show "📱 Local Only"</li>
        <li>After 2 seconds, it should refresh to catch any sync updates</li>
        <li>Every 30 seconds, it should refresh to catch background syncs</li>
        <li>Console should show refresh logs</li>
      </ol>
      
      <h3>Console Logs to Watch For:</h3>
      <ul>
        <li>🔍 WitnessBadge: Loading witness count for: BA-2026-TEST123</li>
        <li>🔄 WitnessBadge: Refreshing after 2 seconds to catch sync updates</li>
        <li>🔄 WitnessBadge: Periodic refresh to catch background syncs</li>
      </ul>
      
      <h3>Test Scenario:</h3>
      <ol>
        <li>Open this component - should show "Local Only"</li>
        <li>In another device, witness the proof BA-2026-TEST123</li>
        <li>Within 2 seconds, this badge should update to "Limited Verification (1 witness)"</li>
        <li>If you navigate away and back, it should refresh immediately</li>
      </ol>
    </div>
  );
};

export { TestWitnessBadgeRefresh };
