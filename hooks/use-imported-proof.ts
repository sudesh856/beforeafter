import { File } from 'expo-file-system';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';

// Type definition for the exported proof JSON structure
type ExportedProof = {
  version: string;
  reportId: string;
  generatedAt: string;
  proof: {
    id: string;
    title: string;
    verificationCode: string;
    createdAt: string;
    before: {
      timestamp: string;
      location: {
        latitude: number;
        longitude: number;
        accuracy: number | null;
      };
      imageHash: string;
      integrity: {
        tampered: boolean;
        edited: boolean;
        captureTime: string;
        lastModified: string;
        hashSignature: string;
      };
    };
    after: {
      timestamp: string;
      location: {
        latitude: number;
        longitude: number;
        accuracy: number | null;
      };
      imageHash: string;
      integrity: {
        tampered: boolean;
        edited: boolean;
        captureTime: string;
        lastModified: string;
        hashSignature: string;
      };
    };
    verification: {
      locationProximity: {
        distanceMeters: number;
        withinThreshold: boolean;
        thresholdMeters: number;
      };
      timeSequence: {
        durationMinutes: number;
        chronologicallyValid: boolean;
      };
      sessionIntegrity: {
        sameSession: boolean;
        sessionId: string;
      };
    };
    timeWindow: {
      declaredMinMinutes: number;
      declaredMaxMinutes: number;
      actualDurationMinutes: number;
      withinWindow: boolean;
    };
  };
  platformMetadata: {
    exportFormat: string;
    apiVersion: string;
    certificationLevel: string;
    trustScore: {
      total: number;
      breakdown: {
        verificationCode: number;
        hashIntegrity: number;
        locationVerification: number;
        integrityChecks: number;
        sessionIntegrity: number;
      };
    };
  };
  auditTrail: Array<{
    id: string;
    type: string;
    timestamp: string;
    sessionId?: string;
    proofId?: string;
    location?: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
    };
    metadata?: any;
  }>;
  externalAnchor?: any; // Optional TSA data
};

export function useImportedProof(): ExportedProof | null {
  const [importedProof, setImportedProof] = useState<ExportedProof | null>(null);

  useEffect(() => {
    // Check if app was opened by tapping on a file
    const checkInitialURL = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.startsWith('file://')) {
          await handleFileImport(initialUrl);
        }
      } catch (error) {
        console.error('Error checking initial URL:', error);
      }
    };

    // Handle incoming files while app is running
    const handleUrlEvent = (event: { url: string }) => {
      if (event.url && event.url.startsWith('file://')) {
        handleFileImport(event.url);
      }
    };

    // Process file import
    const handleFileImport = async (fileUri: string) => {
      try {
        console.log('Processing file import:', fileUri);
        
        // Read file contents
        const file = new File(fileUri);
        const fileContent = await file.text();
        console.log('File content length:', fileContent.length);
        
        // Parse JSON
        const parsedData = JSON.parse(fileContent);
        console.log('Parsed data keys:', Object.keys(parsedData));
        
        // Validate that this is a BeforeAfter proof file by checking required fields
        if (
          parsedData.proof &&
          parsedData.proof.verificationCode &&
          parsedData.proof.before &&
          parsedData.proof.before.imageHash &&
          parsedData.proof.after &&
          parsedData.proof.after.imageHash
        ) {
          console.log('Valid proof file detected');
          setImportedProof(parsedData);
        } else {
          console.log('File is not a valid BeforeAfter proof file');
        }
      } catch (error) {
        console.error('Error importing proof file:', error);
        // Don't crash the app, just log the error
      }
    };

    // Check initial URL on component mount
    checkInitialURL();

    // Add event listener for incoming files
    const subscription = Linking.addEventListener('url', handleUrlEvent);

    // Cleanup event listener on unmount
    return () => {
      subscription?.remove();
    };
  }, []);

  return importedProof;
}
