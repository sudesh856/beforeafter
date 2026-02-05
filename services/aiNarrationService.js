import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Alert } from 'react-native';

const GROQ_API_KEY = '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';

export const isApiKeyConfigured = () => {
  return !!GROQ_API_KEY;
};

const compressImageIfNeeded = async (uri) => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) throw new Error('File does not exist');
    
    let base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    const sizeKB = Math.round(base64.length / 1024);
    console.log(`📏 Image: ${sizeKB}KB`);

    if (sizeKB > 3000) {
      const manipResult = await manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: SaveFormat.JPEG }
      );
      
      base64 = await FileSystem.readAsStringAsync(manipResult.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      console.log(`✅ Compressed: ${Math.round(base64.length / 1024)}KB`);
    }
    
    return { base64, mimeType: getMimeType(uri) };
  } catch (error) {
    throw new Error(`Image failed: ${error.message}`);
  }
};

const getMimeType = (uri) => {
  const ext = uri.split('.').pop().toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] || 'image/jpeg';
};

export async function generateWorkNarrative(beforeUri, afterUri) {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting analysis...');
    
    const [before, after] = await Promise.all([
      compressImageIfNeeded(beforeUri),
      compressImageIfNeeded(afterUri)
    ]);
    
    console.log('📤 Sending to Groq...');
    console.log('Before image size:', before.base64.length);
    console.log('After image size:', after.base64.length);
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: 'Analyze these before and after work photos. Generate a professional report: 1) Initial state, 2) Changes made, 3) Quality assessment, 4) Notable observations. Keep under 200 words.' 
              },
              { 
                type: 'image_url', 
                image_url: { url: `data:${before.mimeType};base64,${before.base64}` } 
              },
              { 
                type: 'image_url', 
                image_url: { url: `data:${after.mimeType};base64,${after.base64}` } 
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.5
      })
    });
    
    console.log('📥 Response status:', response.status);
    
    // Get raw response text first to debug
    const rawText = await response.text();
    console.log('📄 Raw response:', rawText.substring(0, 500));
    
    // Parse if possible
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.log('❌ JSON parse failed');
      throw new Error('Invalid response from AI');
    }
    
    console.log('📊 Parsed data:', JSON.stringify(data, null, 2));
    
    // Check if choices exists
    if (!data.choices || !data.choices[0]) {
      console.log('❌ No choices in response');
      throw new Error('AI returned empty response');
    }
    
    const text = data.choices[0].message?.content || data.choices[0].text;
    
    if (!text || text.trim().length === 0) {
      console.log('❌ Empty text content');
      throw new Error('AI generated empty report');
    }
    
    console.log(`✅ DONE in ${Date.now() - startTime}ms`);
    console.log(`📝 Report: ${text.substring(0, 100)}...`);
    
    return text;
    
  } catch (error) {
    console.error('❌ Complete error:', error);
    console.error('Error stack:', error.stack);
    Alert.alert('AI Error', error.message || 'Unknown error');
    throw error;
  }
}

export async function testApiConnection() {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content: 'Say hi' }]
      })
    });
    const text = await res.text();
    console.log('Test response:', text);
    return res.ok;
  } catch (e) {
    console.log('Test error:', e);
    return false;
  }
}