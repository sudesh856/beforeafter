import { clearAllFirebaseData } from '@/lib/firebase';
import { clearAllWitnesses, getWitnessDatabaseStats, getWitnessProfile } from '@/lib/witnessDatabase';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function SettingsScreen() {
  const [isClearing, setIsClearing] = useState(false);
  const [witnessStats, setWitnessStats] = useState<{ total: number; error?: string }>({ total: 0 });
  const [witnessProfile, setWitnessProfile] = useState<any>(null);

  React.useEffect(() => {
    loadStats();
    loadWitnessProfile();
  }, []);

  const loadStats = async () => {
    const stats = await getWitnessDatabaseStats();
    setWitnessStats(stats);
  };

  const loadWitnessProfile = async () => {
    const profile = await getWitnessProfile();
    setWitnessProfile(profile);
  };

  const handleClearFirebaseData = async () => {
    Alert.alert(
      '⚠️ Clear Network Data',
      'This will permanently delete only the network data for proofs YOU created from Firebase. Proofs created by other devices will NOT be affected. This action cannot be undone.\n\nContinue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Data',
          style: 'destructive',
          onPress: async () => {
            setIsClearing(true);
            try {
              const result = await clearAllFirebaseData();
              
              if (result.deletedCount === 0 && result.skippedCount > 0) {
                // User only witnessed proofs created by others
                Alert.alert(
                  'Info', 
                  'No proofs to delete. You have only witnessed proofs created by other devices.'
                );
              } else if (result.deletedCount > 0 && result.skippedCount === 0) {
                // User deleted all their proofs
                Alert.alert(
                  'Success', 
                  `Deleted ${result.deletedCount} proof(s) from network.` 
                );
              } else if (result.deletedCount > 0 && result.skippedCount > 0) {
                // User deleted some, skipped others
                Alert.alert(
                  'Success', 
                  `Deleted ${result.deletedCount} proof(s) from network. Skipped ${result.skippedCount} proof(s) created by other devices.` 
                );
              } else {
                // Edge case: no proofs at all
                Alert.alert('Info', 'No proofs found to delete.');
              }
              
              console.log('🗑️ Firebase proof data cleared with permission checks');
            } catch (error) {
              Alert.alert('❌ Error', `Failed to clear data: ${error}`);
              console.error('Firebase clear error:', error);
            } finally {
              setIsClearing(false);
              loadStats();
            }
          }
        }
      ]
    );
  };

  const handleClearLocalWitnesses = async () => {
    Alert.alert(
      '⚠️ Clear Local Witnesses',
      `This will delete all ${witnessStats.total} locally stored witness records. You can re-sync them anytime. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsClearing(true);
            try {
              await clearAllWitnesses();
              Alert.alert('✅ Success', 'All local witness data has been cleared.');
              loadStats();
            } catch (error) {
              Alert.alert('❌ Error', `Failed to clear local data: ${error}`);
            } finally {
              setIsClearing(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>Manage your app and data</Text>
        </View>

        {/* Developer Options Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 Developer Options</Text>

          {/* Network Status Card */}
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <Ionicons name="cloud-outline" size={20} color="#3b82f6" />
              <Text style={styles.statusTitle}>Peer-to-Peer Network Status</Text>
            </View>
            <Text style={styles.statusText}>
              Local witnesses stored: <Text style={styles.statusValue}>{witnessStats.total}</Text>
            </Text>
            <Text style={styles.statusHint}>
              These are cryptographic proofs from other devices that verify your proofs
            </Text>
          </View>

          {/* 🏆 Witness Profile Card */}
          <View style={styles.witnessProfileCard}>
            <View style={styles.profileHeader}>
              <Text style={styles.sectionTitle}>🏆 Your Witness Profile</Text>
            </View>
            
            {witnessProfile ? (
              <>
                <View style={styles.rankDisplay}>
                  <Text style={styles.rankIcon}>
                    {witnessProfile.witnessRank === 'Diamond' ? '💎' :
                     witnessProfile.witnessRank === 'Gold' ? '🥇' :
                     witnessProfile.witnessRank === 'Silver' ? '🥈' : '🥉'}
                  </Text>
                  <Text style={styles.rankText}>{witnessProfile.witnessRank} Witness</Text>
                </View>
                
                <Text style={styles.statText}>
                  ✅ Total Verified: {witnessProfile.totalWitnesses}
                </Text>
                
                <Text style={styles.statText}>
                  🎯 Reliability Score: {witnessProfile.reliabilityScore.toFixed(1)}%
                </Text>
              </>
            ) : (
              <Text style={styles.emptyText}>
                Scan a QR code to start your witness journey! 🚀
              </Text>
            )}
          </View>

          {/* Clear Firebase Button */}
          <TouchableOpacity
            style={[styles.destructiveButton, isClearing && styles.buttonDisabled]}
            onPress={handleClearFirebaseData}
            disabled={isClearing}
          >
            {isClearing ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#ffffff" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.destructiveButtonText}>🗑️ Clear My Network Data</Text>
                  <Text style={styles.destructiveButtonSubtitle}>
                    Deletes only your proofs from Firebase
                  </Text>
                </View>
              </>
            )}
          </TouchableOpacity>

          {/* Clear Local Witnesses Button */}
          <TouchableOpacity
            style={[styles.warningButton, isClearing && styles.buttonDisabled]}
            onPress={handleClearLocalWitnesses}
            disabled={isClearing}
          >
            {isClearing ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="document-outline" size={18} color="#ffffff" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningButtonText}>📋 Clear Local Witnesses</Text>
                  <Text style={styles.warningButtonSubtitle}>
                    Deletes {witnessStats.total} witness record(s) locally only
                  </Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ About</Text>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Peer-to-Peer Verification Network</Text>
            <Text style={styles.infoText}>
              This app uses a distributed witness network where proofs are verified by multiple independent devices. 
              Witness data is synced every 30 minutes automatically.
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>What Gets Shared</Text>
            <Text style={styles.infoText}>
              • Cryptographic hashes of your photos{'\n'}
              • Verification codes{'\n'}
              • Timestamps{'\n'}
              {'\n'}
              <Text style={styles.infoHighlight}>Your actual photos are NEVER shared</Text> - only cryptographic data
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Privacy</Text>
            <Text style={styles.infoText}>
              All witness data is completely anonymous. Your proofs cannot be linked to you personally.
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  headerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },

  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },

  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },

  section: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },

  statusCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },

  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  statusTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginLeft: 8,
  },

  statusText: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
  },

  statusValue: {
    fontWeight: '700',
    color: '#3b82f6',
  },

  statusHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    fontStyle: 'italic',
  },

  destructiveButton: {
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  warningButton: {
    backgroundColor: '#ff9500',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  destructiveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },

  destructiveButtonSubtitle: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.9,
  },

  warningButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },

  warningButtonSubtitle: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.9,
  },

  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#cbd5e1',
  },

  infoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },

  infoText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },

  infoHighlight: {
    fontWeight: '700',
    color: '#16a34a',
  },

  // 🏆 Witness Profile Styles
  witnessProfileCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },

  profileHeader: {
    marginBottom: 12,
  },

  rankDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  rankIcon: {
    fontSize: 32,
    marginRight: 8,
  },

  rankText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },

  statText: {
    fontSize: 16,
    color: '#475569',
    marginTop: 4,
  },

  emptyText: {
    fontSize: 16,
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
});
