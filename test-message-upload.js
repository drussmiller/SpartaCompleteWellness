/**
 * Test script to verify message upload functionality
 * Tests both file extension preservation and Object Storage integration
 */

import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMessageUpload() {
  try {
    // Create a test JPG file
    const testImagePath = path.join(__dirname, 'test-image.jpg');
    
    // Create a simple test JPG file (1x1 pixel)
    const jpegData = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xC4,
      0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
      0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0xB2, 0xC0,
      0x07, 0xFF, 0xD9
    ]);
    
    fs.writeFileSync(testImagePath, jpegData);
    console.log('Created test JPG file at:', testImagePath);
    
    // Create form data for message upload
    const form = new FormData();
    form.append('content', 'Test message with JPG image');
    form.append('recipientId', '419'); // Self message for testing
    form.append('file', fs.createReadStream(testImagePath), {
      filename: 'test-upload.jpg',
      contentType: 'image/jpeg'
    });
    
    console.log('Attempting message upload...');
    
    // Make request to message upload endpoint
    const response = await fetch('http://localhost:5000/api/messages', {
      method: 'POST',
      body: form,
      headers: {
        ...form.getHeaders(),
        'Cookie': 'connect.sid=s%3AOlldEJtRu33a4wFn17Rk7gbBAkrxU57i.QzxJHr8v9xqZPJSZWPrIRQHtUVIc2q2E41Gj6e9E3tg'
      }
    });
    
    const result = await response.text();
    console.log('Response status:', response.status);
    console.log('Response:', result);
    
    if (response.ok) {
      const messageData = JSON.parse(result);
      console.log('Message created successfully!');
      console.log('Media URL:', messageData.mediaUrl);
      
      // Check if file extension is preserved
      if (messageData.mediaUrl && messageData.mediaUrl.includes('.jpg')) {
        console.log('✓ File extension preserved correctly (.jpg)');
      } else {
        console.log('✗ File extension not preserved:', messageData.mediaUrl);
      }
      
      // Test Object Storage URL construction
      if (messageData.mediaUrl && messageData.mediaUrl.startsWith('shared/uploads/')) {
        console.log('✓ Object Storage format correct');
      } else {
        console.log('✗ Object Storage format incorrect:', messageData.mediaUrl);
      }
    } else {
      console.log('Upload failed:', result);
    }
    
    // Cleanup
    fs.unlinkSync(testImagePath);
    console.log('Cleaned up test file');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testMessageUpload();