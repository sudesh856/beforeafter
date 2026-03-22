// ExportButtons.tsx
// Add this component to your proof detail screen ([id].tsx)

import { enhanceWithLegalMetadata } from '@/lib/legalExport';
import { generateJSONReport, generatePDFContent } from '@/lib/platformExport';
import { ProofRecord } from '@/lib/proof';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { FileText, Link2, Scale, Upload } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Modal, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ExportButtonsProps {
  proof?: ProofRecord | null;
}

export function ExportButtons({ proof }: ExportButtonsProps) {
  const [showExportModal, setShowExportModal] = useState(false);

  if (!proof) {
    return null;
  }
  
  const getAuditTrail = async () => {
    try {
      const auditData = await AsyncStorage.getItem('auditTrail');
      return auditData ? JSON.parse(auditData) : [];
    } catch (error) {
      console.error('Error fetching audit trail:', error);
      return [];
    }
  };

  const shareVerificationCode = async () => {
    try {
      await Share.share({
        message: `Verification Code: ${proof.verificationCode}\n\nThis work has been verified with cryptographic proof. View full report using this code.`,
        title: 'Work Verification Code',
      });
    } catch (error) {
      console.error(error);
    }
  };

  const exportJSONAsRawText = async () => {
    try {
      const auditTrail = await getAuditTrail();
      const report = generateJSONReport(proof, auditTrail);
      const reportText = JSON.stringify(report, null, 2);
      
      await Share.share({
        message: reportText,
        title: `Verification Report - ${proof.verificationCode}`,
      });
      setShowExportModal(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to export JSON report');
      console.error(error);
    }
  };

  const exportJSONAsFile = async () => {
    try {
      const auditTrail = await getAuditTrail();
      const report = generateJSONReport(proof, auditTrail);
      const reportText = JSON.stringify(report, null, 2);
      
      const fileName = `BeforeAfter_${proof.verificationCode}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(fileUri, reportText, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: `Share Verification Report - ${proof.verificationCode}`,
      });
      
      setShowExportModal(false);
      
      setTimeout(() => {
        FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {
          // Ignore cleanup errors
        });
      }, 5000);
    } catch (error) {
      Alert.alert('Error', 'Failed to export JSON file');
      console.error(error);
    }
  };

  const exportJSON = async () => {
    setShowExportModal(true);
  };

  const exportPDF = async () => {
    try {
      const auditTrail = await getAuditTrail();
      const html = generatePDFContent(proof, auditTrail);
    
    await Share.share({
      message: html,
      title: `Verification Report - ${proof.verificationCode}`,
      
    });
  } catch (error) {
    Alert.alert('Error', 'Failed to export PDF report');
    console.error(error);
  }
};

const exportLegalJSON = async () => {
  try {
    if (!proof) return;
    const auditTrail = await getAuditTrail();
    const baseReport = generateJSONReport(proof, auditTrail);
    const legalReport = await enhanceWithLegalMetadata(proof, baseReport);
    
    await Share.share({
      message: JSON.stringify(legalReport, null, 2),
      title: `⚖️ Legal Evidence - ${proof.verificationCode}`,
    });
  } catch (error) {
    Alert.alert('Error', 'Failed to export legal evidence');
  }
};

const exportLegalPDF = async () => {
  try {
    if (!proof) return;
    const auditTrail = await getAuditTrail();
    const baseReport = generateJSONReport(proof, auditTrail);
    const legalReport = await enhanceWithLegalMetadata(proof, baseReport);
    
    // Convert to human-readable PDF content
    // ISSUE 5: Remove security-negative fields from Legal PDF
    const pdfContent = `
LEGAL EVIDENCE PACKAGE
Verification Code: ${proof.verificationCode}

AFFIDAVIT OF AUTHENTICITY
${legalReport.legalMetadata?.affidavit?.statement || 'N/A'}

CRYPTOGRAPHIC VERIFICATION
• Before Photo Hash: ${proof.beforeHash?.substring(0, 32) || 'N/A'}...
• After Photo Hash: ${proof.afterHash?.substring(0, 32) || 'N/A'}...
• Verification Code: ${proof.verificationCode}

LOCATION & TIMING
• GPS: ${proof.beforeLocation?.latitude?.toFixed(6) || 'N/A'}, ${proof.beforeLocation?.longitude?.toFixed(6) || 'N/A'}
• Date: ${new Date(proof.createdAt).toLocaleDateString()}
• Device: ${proof.deviceName} (${proof.platform})

DEVICE AUTHENTICATION
• Device ID: ${legalReport.legalMetadata?.deviceAuthentication?.deviceID || 'N/A'}
• Timestamp: ${legalReport.legalMetadata?.deviceAuthentication?.timestamp || 'N/A'}

This evidence meets cryptographic standards for digital authentication.
    `;
    
    await Share.share({
      message: pdfContent,
      title: `⚖️ Legal PDF Evidence - ${proof.verificationCode}`,
    });
  } catch (error) {
    Alert.alert('Error', 'Failed to export legal PDF');
  }
};



  return (
    <View style={styles.container}>
      <View style={{flexDirection:'row', alignItems:'center'}}><Upload size={20} color="#1f2937" /><Text style={styles.sectionTitle}> Platform Export</Text></View>
      
      <TouchableOpacity style={styles.exportButton} onPress={exportJSON}>
        <Text style={styles.exportButtonText}>📊 Export JSON Report</Text>
        <Text style={styles.exportSubtext}>For Thumbtack, Angi, API integration</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.exportButton} onPress={exportPDF}>
        <View style={{flexDirection:'row', alignItems:'center'}}><FileText size={16} color="white" /><Text style={styles.exportButtonText}> Export PDF Report</Text></View>
        <Text style={styles.exportSubtext}>For insurance, clients, documentation</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.codeButton} onPress={shareVerificationCode}>
        <View style={{flexDirection:'row', alignItems:'center'}}><Link2 size={16} color="white" /><Text style={styles.codeButtonText}> Share Verification Code</Text></View>
        <Text style={styles.exportSubtext}>Quick verification without full report</Text>
      </TouchableOpacity>

      {/* ▼▼▼ ADD LEGAL BUTTONS HERE ▼▼▼ */}
    <View style={{flexDirection:'row', alignItems:'center'}}><Scale size={20} color="#1f2937" /><Text style={styles.sectionTitle}> Legal Evidence</Text></View>
    
    <TouchableOpacity style={styles.legalButton} onPress={exportLegalJSON}>
      <View style={{flexDirection:'row', alignItems:'center'}}><Scale size={16} color="white" /><Text style={styles.legalButtonText}> Legal JSON Evidence</Text></View>
      <Text style={styles.exportSubtext}>Court-admissible with affidavit</Text>
    </TouchableOpacity>

    <TouchableOpacity style={styles.legalButton} onPress={exportLegalPDF}>
      <View style={{flexDirection:'row', alignItems:'center'}}><Scale size={16} color="white" /><Text style={styles.legalButtonText}> Legal PDF Evidence</Text></View>
      <Text style={styles.exportSubtext}>Human-readable for judges/lawyers</Text>
    </TouchableOpacity>
    {/* ▲▲▲ END LEGAL BUTTONS ▲▲▲ */}

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          ✅ Reports include GPS coordinates, timestamps, cryptographic hashes, and integrity checks
        </Text>
        <Text style={styles.infoText}>
          🏢 Compatible with platform auto-verification systems
        </Text>
      </View>

      {/* Export Options Modal */}
      <Modal
        visible={showExportModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Export JSON Report</Text>
            <Text style={styles.modalSubtitle}>Choose export format:</Text>
            
            <TouchableOpacity 
              style={styles.modalOptionButton} 
              onPress={exportJSONAsRawText}
            >
              <Text style={styles.modalOptionTitle}>Share as Raw Text</Text>
              <Text style={styles.modalOptionDescription}>
                Share JSON as plain text (current behavior)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalOptionButton} 
              onPress={exportJSONAsFile}
            >
              <Text style={styles.modalOptionTitle}>Share as .json File</Text>
              <Text style={styles.modalOptionDescription}>
                Save as file that can be opened with BeforeAfter app
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelButton} 
              onPress={() => setShowExportModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginVertical: 10,
  },
  legalButton: {
  backgroundColor: '#7c3aed', // Purple for legal
  padding: 16,
  borderRadius: 8,
  marginBottom: 12,
},
legalButtonText: {
  color: 'white',
  fontSize: 16,
  fontWeight: 'bold',
  marginBottom: 4,
},
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#1f2937',
  },
  exportButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  exportButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  exportSubtext: {
    color: '#dbeafe',
    fontSize: 12,
  },
  codeButton: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  codeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    marginTop: 8,
  },
  infoText: {
    color: '#1e40af',
    fontSize: 12,
    marginBottom: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalOptionButton: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  modalOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  modalOptionDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  modalCancelButton: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
  },
});