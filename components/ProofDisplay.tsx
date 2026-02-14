/**
 * ProofDisplay Component
 * 
 * Displays before/after proof data in read-only or editable mode
 * 
 * Props:
 *   proof: ProofObject - The proof data to display
 *   mode: 'worker' | 'client' - Display mode
 *     - 'worker': Full editing capabilities
 *     - 'client': Read-only, sandboxed, with verification banner
 *   onEdit?: (proof: ProofObject) => void - Callback for edits (worker only)
 */

import PropTypes from 'prop-types';
import React, { useEffect } from 'react';
import {
    Image,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export interface ProofObject {
  proofId: string;
  status: string;
  workerId: string;
  createdAt: string;
  before: {
    timestamp: string;
    imageHash: string;
    gps: {
      lat: number;
      lon: number;
    };
    imageUri?: string;
  };
  after: {
    timestamp: string;
    imageHash: string;
    gps: {
      lat: number;
      lon: number;
    };
    imageUri?: string;
  };
  [key: string]: any;
}

interface ProofDisplayProps {
  proof: ProofObject;
  mode?: 'worker' | 'client';
  onEdit?: (proof: ProofObject) => void;
  onDelete?: () => void;
}

export const ProofDisplay: React.FC<ProofDisplayProps> = ({
  proof,
  mode = 'worker',
  onEdit,
  onDelete,
}) => {
  // Validate mode
  if (mode !== 'worker' && mode !== 'client') {
    console.warn('⚠️ Invalid ProofDisplay mode:', mode);
    return null;
  }

  const isReadOnly = mode === 'client';

  // Freeze objects in client mode (Section 4.4)
  useEffect(() => {
    if (mode === 'client') {
      Object.freeze(proof);
      Object.freeze(proof.before);
      Object.freeze(proof.after);
    }
  }, [proof, mode]);

  return (
    <SafeAreaView style={[styles.container, isReadOnly && styles.containerClient]}>
      <ScrollView>
        {/* Client-only verification watermark */}
        {isReadOnly && (
          <View style={styles.watermark}>
            <Text style={styles.watermarkText}>✅ VERIFIED • READ ONLY</Text>
          </View>
        )}

        {/* Main content - gestures disabled in client mode */}
        <View style={isReadOnly ? styles.disabledGestures : styles.enabledGestures}>
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.heading}>
                {isReadOnly ? 'Verified Proof' : 'Proof Details'}
              </Text>
            </View>

            {/* Proof ID Section */}
            <View style={styles.section}>
              <Text style={styles.label}>Proof ID</Text>
              <Text style={styles.value}>{proof.proofId}</Text>
            </View>

            {/* Status */}
            <View style={styles.section}>
              <Text style={styles.label}>Status</Text>
              <View
                style={[
                  styles.statusBadge,
                  isReadOnly && styles.statusBadgeClient,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    isReadOnly && styles.statusTextClient,
                  ]}
                >
                  {proof.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Worker ID */}
            <View style={styles.section}>
              <Text style={styles.label}>Worker ID</Text>
              <Text style={styles.value}>{proof.workerId}</Text>
            </View>

            {/* Created At */}
            <View style={styles.section}>
              <Text style={styles.label}>Created At</Text>
              <Text style={styles.value}>
                {new Date(proof.createdAt).toLocaleString()}
              </Text>
            </View>

            {/* Metadata Section */}
            {proof.deviceName && (
              <View style={styles.section}>
                <Text style={styles.label}>Device Info</Text>
                <Text style={styles.value}>{proof.deviceName}</Text>
              </View>
            )}

            {proof.platform && (
              <View style={styles.section}>
                <Text style={styles.label}>Platform Info</Text>
                <Text style={styles.value}>{proof.platform}</Text>
              </View>
            )}

            {proof.algorithmVersion && (
              <View style={styles.section}>
                <Text style={styles.label}>Algorithm Info</Text>
                <Text style={styles.value}>{proof.algorithmVersion}</Text>
              </View>
            )}

            {/* Before Section */}
            <View style={[styles.section, styles.photoSection]}>
              <Text style={styles.sectionTitle}>Before</Text>

              {proof.before.imageUri && (
                <Image
                  source={{ uri: proof.before.imageUri }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              )}

              <Text style={styles.label}>Timestamp</Text>
              <Text style={styles.value}>
                {new Date(proof.before.timestamp).toLocaleString()}
              </Text>

              <Text style={styles.label}>GPS Location</Text>
              <Text style={styles.value}>
                {proof.before.gps.lat.toFixed(6)}, {proof.before.gps.lon.toFixed(6)}
              </Text>

              <Text style={styles.label}>Image Hash</Text>
              <Text style={[styles.value, styles.monospace]}>
                {proof.before.imageHash}
              </Text>
            </View>

            {/* After Section */}
            <View style={[styles.section, styles.photoSection]}>
              <Text style={styles.sectionTitle}>After</Text>

              {proof.after.imageUri && (
                <Image
                  source={{ uri: proof.after.imageUri }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              )}

              <Text style={styles.label}>Timestamp</Text>
              <Text style={styles.value}>
                {new Date(proof.after.timestamp).toLocaleString()}
              </Text>

              <Text style={styles.label}>GPS Location</Text>
              <Text style={styles.value}>
                {proof.after.gps.lat.toFixed(6)}, {proof.after.gps.lon.toFixed(6)}
              </Text>

              <Text style={styles.label}>Image Hash</Text>
              <Text style={[styles.value, styles.monospace]}>
                {proof.after.imageHash}
              </Text>
            </View>

            {/* Worker Mode: Edit/Delete Buttons */}
            {!isReadOnly && (
              <View style={styles.actions}>
                {onEdit && (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => onEdit(proof)}
                  >
                    <Text style={styles.editButtonText}>✏️ Edit Proof</Text>
                  </TouchableOpacity>
                )}

                {onDelete && (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={onDelete}
                  >
                    <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

ProofDisplay.propTypes = {
  proof: PropTypes.shape({
    proofId: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    workerId: PropTypes.string.isRequired,
    createdAt: PropTypes.string.isRequired,
    before: PropTypes.shape({
      timestamp: PropTypes.string.isRequired,
      imageHash: PropTypes.string.isRequired,
      imageUri: PropTypes.string,
      gps: PropTypes.shape({
        lat: PropTypes.number.isRequired,
        lon: PropTypes.number.isRequired,
      }).isRequired,
    }).isRequired,
    after: PropTypes.shape({
      timestamp: PropTypes.string.isRequired,
      imageHash: PropTypes.string.isRequired,
      imageUri: PropTypes.string,
      gps: PropTypes.shape({
        lat: PropTypes.number.isRequired,
        lon: PropTypes.number.isRequired,
      }).isRequired,
    }).isRequired,
  }).isRequired,
  mode: PropTypes.oneOf(['worker', 'client']),
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerClient: {
    backgroundColor: '#f5f5f5',
  },

  // Watermark (client only)
  watermark: {
    backgroundColor: '#4CAF5080',
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  watermarkText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 1,
  },

  // Gestures
  disabledGestures: {
    pointerEvents: 'none',
    opacity: 1,
  },
  enabledGestures: {
    pointerEvents: 'auto',
  },

  content: {
    padding: 16,
  },

  // Header
  header: {
    marginBottom: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },

  // Sections
  section: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    marginTop: 8,
  },

  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 8,
  },

  value: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
    lineHeight: 20,
  },

  monospace: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#666',
  },

  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },

  statusBadgeClient: {
    backgroundColor: '#4CAF5020',
  },

  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976d2',
  },

  statusTextClient: {
    color: '#4CAF50',
  },

  // Photo section
  photoSection: {
    paddingBottom: 20,
  },

  photo: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginVertical: 12,
    backgroundColor: '#ddd',
  },

  // Actions
  actions: {
    marginTop: 24,
    gap: 12,
  },

  editButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },

  editButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  deleteButton: {
    backgroundColor: '#f44336',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },

  deleteButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
