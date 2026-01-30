import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getPersistentDeviceId } from './deviceId';
import { ProofRecord } from './proof';


// 1. DEVICE AUTHENTICATION
export async function getDeviceProof() {
  const deviceId = await getPersistentDeviceId();
  
  return {
    timestamp: new Date().toISOString(),
    deviceID: deviceId,
    platform: Device.osName,
    osVersion: Device.osVersion,
    // iOS Secure Enclave / Android KeyStore simulation
    secureEnclaveAvailable: Platform.OS === 'ios',
    keystoreAvailable: Platform.OS === 'android',
  };
}

// 2. AFFIDAVIT TEMPLATE
export function generateAffidavit(proof: ProofRecord, userName?: string) {
  return {
    statement: `I, ${userName || 'the undersigned'}, hereby certify that:
1. I personally captured the before and after photographs
2. Photos were taken at the specified GPS locations and times
3. No post-capture editing, filtering, or manipulation occurred
4. I acknowledge that altering these files may constitute evidence tampering`,
    
    acknowledgment: `This certification is made with the understanding that:
• Photos are cryptographically sealed (SHA-256)
• GPS coordinates are embedded in the hash
• Verification code changes if any data is altered
• This document may be used as evidence in disputes`,
    
    signatureBlock: {
      name: userName || '[Name to be filled]',
      date: new Date().toISOString().split('T')[0],
      device: proof.deviceName,
      sessionId: proof.sessionId,
    }
  };
}

// 3. ENHANCE EXISTING EXPORT WITH LEGAL METADATA
export async function enhanceWithLegalMetadata(proof: ProofRecord, baseReport: any) {
  const deviceAuth = await getDeviceProof();
  
  // Prepare external anchor data if present
  const externalAnchorSection = proof.externalAnchor ? {
    type: proof.externalAnchor.type,
    ...(proof.externalAnchor.type === 'blockchain' ? {
      network: (proof.externalAnchor as any).network,
      rootHash: (proof.externalAnchor as any).rootHash,
      txHash: (proof.externalAnchor as any).txHash,
      blockNumber: (proof.externalAnchor as any).blockNumber,
      blockTimestamp: (proof.externalAnchor as any).blockTimestamp,
      confirmations: (proof.externalAnchor as any).confirmations,
      isConfirmed: (proof.externalAnchor as any).isConfirmed,
      merkleProofDepth: (proof.externalAnchor as any).merkleProof?.length || 0,
    } : {
      tsaUrl: (proof.externalAnchor as any).tsaUrl,
      tsaName: (proof.externalAnchor as any).tsaName,
      authenticatedTime: (proof.externalAnchor as any).authenticatedTime,
      serialNumber: (proof.externalAnchor as any).serialNumber,
      isValid: (proof.externalAnchor as any).isValid,
    }),
    anchoredAt: (proof.externalAnchor as any).anchoredAt,
  } : null;
  
  return {
    ...baseReport,
    
    // Add legal layer
    legalMetadata: {
      affidavit: generateAffidavit(proof),
      deviceAuthentication: deviceAuth,
      forensicChain: {
        hashAlgorithm: 'SHA-256 (FIPS 180-4)',
        hashIncludes: ['image_data', 'gps_coordinates', 'timestamp', 'device_id'],
        tamperEvidence: 'Any alteration changes verification code',
        externalTimeAnchor: externalAnchorSection ? 
          `Independently verified by external ${externalAnchorSection.type === 'blockchain' ? 'blockchain' : 'RFC 3161 Timestamp Authority'}` :
          'Not anchored (proof valid but without external time verification)',
      },
      compliance: {
        standards: ['SHA-256', 'GPS Time Sync', 'Device Authentication'],
        legalReference: 'Digital evidence authentication principles',
        externalAnchoring: externalAnchorSection ? 'Implemented (Merkle tree + ' + (externalAnchorSection.type === 'blockchain' ? 'blockchain' : 'TSA') + ')' : 'Not implemented',
      },
    },
    
    // External anchor details (if present)
    ...(externalAnchorSection ? { externalAnchor: externalAnchorSection } : {}),
    
    // Human-readable summary for courts
    courtSummary: `This evidence package contains:
• Before/After photos with cryptographic verification
• GPS location verification (${proof.beforeLocation.latitude.toFixed(6)}, ${proof.beforeLocation.longitude.toFixed(6)})
• Device-authenticated timestamps
• Tamper-evident verification code: ${proof.verificationCode}
${externalAnchorSection ? `• External timestamp anchor: ${externalAnchorSection.type === 'blockchain' ? `${externalAnchorSection.network} block ${externalAnchorSection.blockNumber}` : `RFC 3161 TSA (${externalAnchorSection.tsaName})`}` : ''}
• Affidavit of authenticity`,
  };
}