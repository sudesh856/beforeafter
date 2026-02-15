import { RATE_LIMIT_ATTEMPTS, RATE_LIMIT_LOCKOUT_MS } from '@/app/config/api';
import {
  canonicalizeProof,
  ProofObject,
  validateProof,
  verifyProofSignature,
} from '@/app/utils/crypto';
import { fetchProofByPin } from '@/app/utils/proofUpload';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { sha256 } from 'js-sha256';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface ClientState {
  pin: string;
  loading: boolean;
  error: string;
  proof: ProofObject | null;
  isVerified: boolean;
  attempts: number;
  lockoutUntil: number | null;
  keyRotated?: boolean;
}

export default function ClientVerifyScreen() {
  const router = useRouter();
  const [state, setState] = useState<ClientState>({
    pin: '',
    loading: false,
    error: '',
    proof: null,
    isVerified: false,
    attempts: 0,
    lockoutUntil: null,
  });

  const appState = React.useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'background') {
      console.log('🛡️ App backgrounding - clearing sensitive data');
      clearSensitiveData();
    }
    appState.current = nextAppState;
  };

  /**
   * Clear proof and PIN from memory
   * Section 5.2: Memory sandbox
   */
  const clearSensitiveData = () => {
    setState(prev => ({
      ...prev,
      pin: '',
      proof: null,
      isVerified: false,
    }));
  };

  /**
   * Cleanup on screen unmount
   * Section 5.2: Memory sandbox - cleanup
   */
  useEffect(() => {
    return () => {
      clearSensitiveData();
    };
  }, []);

  /**
   * Paste PIN from clipboard
   */
  const handlePastePin = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      // Auto-sanitize: auto-capitalize and trim
      const sanitized = (text || '').toUpperCase().trim().slice(0, 10);
      setState(prev => ({ ...prev, pin: sanitized }));
    } catch (error) {
      console.error('Error pasting PIN:', error);
    }
  };

  /**
   * Verify PIN and signature
   * 
   * Security flow:
   * 1. Rate limit check
   * 2. Fetch proof + signature + public key from backend
   * 3. Verify signature CLIENT-SIDE only
   * 4. Display read-only proof if valid
   * 5. Big red error if signature fails
   */
  /**
   * Reconstruct the proof object strictly from the received data
   * strictly adhering to the ProofObject interface and canonical types.
   * This ensures we only verify and render exactly what was signed.
   */
  const reconstructCanonicalProof = (raw: any): ProofObject => {
    return {
      proofId: String(raw.proofId || ''),
      status: String(raw.status || ''),
      workerId: String(raw.workerId || ''),
      createdAt: String(raw.createdAt || ''),
      before: {
        timestamp: String(raw.before?.timestamp || ''),
        imageHash: String(raw.before?.imageHash || ''),
        gps: {
          lat: Number(raw.before?.gps?.lat || 0),
          lon: Number(raw.before?.gps?.lon || 0),
        },
      },
      after: {
        timestamp: String(raw.after?.timestamp || ''),
        imageHash: String(raw.after?.imageHash || ''),
        gps: {
          lat: Number(raw.after?.gps?.lat || 0),
          lon: Number(raw.after?.gps?.lon || 0),
        },
      },
    };
  };

  /**
   * Verify PIN and signature
   * 
   * Security flow:
   * 1. Rate limit check
   * 2. Fetch proof + signature + public key from backend
   * 3. Reconstruct canonical proof object (sanitize inputs)
   * 4. Verify signature against THIS reconstructed object
   * 5. Display THIS reconstructed object if valid
   * 6. Big red error if signature fails
   */
  const verifyProof = async () => {
    // Rate limit check (Section 5.10)
    if (state.lockoutUntil && Date.now() < state.lockoutUntil) {
      setState(prev => ({
        ...prev,
        error: 'Too many attempts. Try again in 5 minutes.',
      }));
      return;
    }

    // Validation
    if (!state.pin || state.pin.length !== 10) {
      setState(prev => ({
        ...prev,
        error: 'Please enter a 10-character code',
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      loading: true,
      error: '',
    }));

    try {
      // Increment attempt counter
      const newAttempts = state.attempts + 1;

      // Step 1: Fetch proof data from backend
      const data = await fetchProofByPin(state.pin);

      // Step 2: Validate proof structure (Section 5.5)
      if (!validateProof(data.proof)) {
        throw new Error('Invalid proof data received from backend');
      }

      // Step 3: Reconstruct Canonical Proof (CRITICAL SECURITY FIX)
      // We must verify and render the EXACT same data structure
      const canonicalProof = reconstructCanonicalProof(data.proof);
      console.log('🛡️ Reconstructed canonical proof for verification');

      // Step 4: Verify signature CLIENT-SIDE (CRITICAL)
      // This is the absolute gatekeeper for rendering
      console.log('🔒 Verifying signature client-side...');
      const isSignatureValid = await verifyProofSignature(
        canonicalProof, // Verify the CLEAN object
        data.signature,
        data.workerPublicKey
      );

      console.log('🔒 Verification result:', isSignatureValid);

      if (isSignatureValid !== true) {
        // STRICT CHECK: Must be explicitly true
        // BIG RED ERROR - refuse display (Section 5.11)
        throw new Error('❌ CRITICAL: Proof has been tampered with - signature invalid');
      }

      // Freeze proof objects for immutability (Section 4.4)
      Object.freeze(canonicalProof);
      Object.freeze(canonicalProof.before);
      Object.freeze(canonicalProof.after);

      // Success - display proof
      setState(prev => ({
        ...prev,
        proof: canonicalProof, // Render the CLEAN object
        isVerified: true,
        keyRotated: !!data.keyRotated, // Extract key rotation flag
        attempts: newAttempts,
        error: '',
      }));

      console.log('✅ Proof verified and displayed');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error';

      // Generic errors only (Section 5.11)
      let displayError = errorMessage;
      if (errorMessage.includes('Network')) {
        displayError = 'Network error. Please try again.';
      } else if (errorMessage.includes('410')) {
        displayError = 'Code has expired';
      } else if (errorMessage.includes('404')) {
        displayError = 'Invalid or expired code';
      } else if (errorMessage.includes('tampered')) {
        displayError = errorMessage; // Show critical tampering error
      }

      const newAttempts = state.attempts + 1;

      setState(prev => ({
        ...prev,
        error: displayError,
        attempts: newAttempts,
      }));

      // Lockout after 5 failed attempts (Section 5.10)
      if (newAttempts >= RATE_LIMIT_ATTEMPTS) {
        const lockoutTime = Date.now() + RATE_LIMIT_LOCKOUT_MS;
        setState(prev => ({
          ...prev,
          lockoutUntil: lockoutTime,
          error: 'Too many failed attempts. Locked for 5 minutes.',
        }));
      }
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  /**
   * Go back to home screen
   */
  const goBack = () => {
    clearSensitiveData();
    router.back();
  };

  // Show verified proof
  if (state.isVerified && state.proof) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView>
          {/* Verification banner */}
          <View style={styles.verificationBanner}>
            <Text style={styles.verificationText}>✅ CRYPTOGRAPHICALLY VERIFIED</Text>
          </View>

          {/* Key Rotation Warning */}
          {state.keyRotated && (
            <View style={[styles.verificationBanner, { backgroundColor: '#FFC107' }]}>
              <Text style={[styles.verificationText, { color: '#000' }]}>
                ⚠️ SIGNED WITH OLD KEY (ROTATED)
              </Text>
            </View>
          )}

          {/* Proof display */}
          <View style={styles.proofContainer}>
            <Text style={styles.heading}>Verified Proof</Text>

            {/* Proof ID */}
            <View style={styles.section}>
              <Text style={styles.label}>Proof ID</Text>
              <Text style={styles.value}>{state.proof.proofId}</Text>
            </View>

            {/* Status */}
            <View style={styles.section}>
              <Text style={styles.label}>Status</Text>
              <Text style={[styles.value, styles.statusBadge]}>
                {state.proof.status.toUpperCase()}
              </Text>
            </View>

            {/* Worker ID */}
            <View style={styles.section}>
              <Text style={styles.label}>Worker ID</Text>
              <Text style={styles.value}>{state.proof.workerId}</Text>
            </View>

            {/* Created At */}
            <View style={styles.section}>
              <Text style={styles.label}>Created</Text>
              <Text style={styles.value}>
                {new Date(state.proof.createdAt).toLocaleString()}
              </Text>
            </View>

            {/* Before Photo Info */}
            <View style={styles.section}>
              <Text style={styles.subheading}>Before</Text>
              <Text style={styles.label}>Timestamp</Text>
              <Text style={styles.value}>
                {new Date(state.proof.before.timestamp).toLocaleString()}
              </Text>
              <Text style={styles.label}>GPS Location</Text>
              <Text style={styles.value}>
                {state.proof.before.gps.lat.toFixed(6)}, {state.proof.before.gps.lon.toFixed(6)}
              </Text>
              <Text style={styles.label}>Image Hash</Text>
              <Text style={[styles.value, styles.hash]}>
                {state.proof.before.imageHash}
              </Text>
            </View>

            {/* After Photo Info */}
            <View style={styles.section}>
              <Text style={styles.subheading}>After</Text>
              <Text style={styles.label}>Timestamp</Text>
              <Text style={styles.value}>
                {new Date(state.proof.after.timestamp).toLocaleString()}
              </Text>
              <Text style={styles.label}>GPS Location</Text>
              <Text style={styles.value}>
                {state.proof.after.gps.lat.toFixed(6)}, {state.proof.after.gps.lon.toFixed(6)}
              </Text>
              <Text style={styles.label}>Image Hash</Text>
              <Text style={[styles.value, styles.hash]}>
                {state.proof.after.imageHash}
              </Text>
            </View>

            {/* Proof Hash */}
            <View style={styles.section}>
              <Text style={styles.label}>Proof Hash</Text>
              <Text style={[styles.value, styles.hash]}>
                {sha256(canonicalizeProof(state.proof))}
              </Text>
            </View>

            {/* Back Button */}
            <TouchableOpacity style={styles.backButton} onPress={goBack}>
              <Text style={styles.backButtonText}>← Back to Home</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Show PIN entry screen
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.innerContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Verify Proof</Text>
            <Text style={styles.subtitle}>
              Enter the 10-character code from the worker
            </Text>
          </View>

          {/* PIN Input Section */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Verification Code</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="XXXXXXXXXX"
                placeholderTextColor="#999"
                value={state.pin}
                onChangeText={pin => setState(prev => ({
                  ...prev,
                  pin: pin.toUpperCase().slice(0, 10),
                }))}
                autoCapitalize="characters"
                maxLength={10}
                editable={!state.loading && !state.lockoutUntil}
              />
              {state.pin.length > 0 && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => setState(prev => ({ ...prev, pin: '' }))}
                >
                  <Text style={styles.clearButtonText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Paste Button */}
            <TouchableOpacity
              style={styles.pasteButton}
              onPress={handlePastePin}
              disabled={state.loading || !!state.lockoutUntil}
            >
              <Text style={styles.pasteButtonText}>📋 Paste</Text>
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {state.error && (
            <View style={[styles.errorBox, state.error.includes('CRITICAL') && styles.criticalError]}>
              <Text style={[styles.errorText, state.error.includes('CRITICAL') && { color: 'white' }]}>{state.error}</Text>
            </View>
          )}

          {/* Attempt Counter */}
          {state.attempts > 0 && !state.lockoutUntil && (
            <Text style={styles.attemptCounter}>
              Attempts: {state.attempts}/{RATE_LIMIT_ATTEMPTS}
            </Text>
          )}

          {/* Verify Button */}
          <TouchableOpacity
            style={[
              styles.verifyButton,
              ((state.loading || !state.pin || state.lockoutUntil) ? styles.buttonDisabled : null) as any
            ]}
            onPress={verifyProof}
            disabled={state.loading || !state.pin || !!state.lockoutUntil}
          >
            {state.loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.verifyButtonText}>Verify Code</Text>
            )}
          </TouchableOpacity>

          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={goBack}
            disabled={state.loading}
          >
            <Text style={styles.backButtonText}>← Back to Home</Text>
          </TouchableOpacity>

          {/* Info Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Your data is sandboxed and encrypted. No permissions needed.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
  },
  innerContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },

  // Header
  header: {
    marginTop: 20,
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },

  // Input Section
  inputSection: {
    marginBottom: 30,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: '#000',
    backgroundColor: '#fff',
  },
  clearButton: {
    marginLeft: 10,
    padding: 8,
  },
  clearButtonText: {
    fontSize: 24,
    color: '#999',
  },
  pasteButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  pasteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066cc',
  },

  // Error
  errorBox: {
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#ef5350',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  criticalError: {
    backgroundColor: '#b71c1c',
    borderColor: '#b71c1c',
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },

  // Attempt counter
  attemptCounter: {
    fontSize: 12,
    color: '#f57c00',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },

  // Buttons
  verifyButton: {
    height: 48,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#0066cc',
    fontSize: 14,
    fontWeight: '600',
  },

  // Footer
  footer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Verification banner
  verificationBanner: {
    backgroundColor: '#4CAF50',
    padding: 16,
    margin: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
  },

  // Proof display
  proofContainer: {
    padding: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  subheading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginTop: 12,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
    marginBottom: 8,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#4CAF5020',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  hash: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
});
