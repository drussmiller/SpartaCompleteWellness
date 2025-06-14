/**
 * Test script to verify the message upload filename fix
 * This tests that JPG files pasted as "pasted-image.png" get the correct .jpg extension
 */

const fs = require('fs');
const FormData = require('form-data');

async function testMessageUploadFix() {
  try {
    console.log('Testing message upload filename fix...');
    
    // Create a test JPEG image buffer (minimal valid JPEG)
    const jpegHeader = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      // ... minimal JPEG data ...
      0xFF, 0xD9 // EOI marker
    ]);
    
    const formData = new FormData();
    formData.append('recipientId', '1');
    formData.append('content', 'Test message with JPG image');
    formData.append('file', jpegHeader, {
      filename: 'pasted-image.png', // Simulates browser behavior
      contentType: 'image/jpeg'     // Actual MIME type
    });
    
    const response = await fetch('http://localhost:5000/api/messages', {
      method: 'POST',
      headers: {
        'Cookie': 'connect.sid=your-session-id' // Replace with actual session
      },
      body: formData
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('Upload successful:', result);
      
      // Check if the stored filename has .jpg extension
      if (result.hasImage && result.content) {
        console.log('Image URL:', result.content);
        if (result.content.includes('.jpg')) {
          console.log('✅ SUCCESS: File extension correctly preserved as .jpg');
        } else if (result.content.includes('.png')) {
          console.log('❌ FAIL: File still has .png extension');
        } else {
          console.log('⚠️  UNKNOWN: Could not determine file extension from URL');
        }
      }
    } else {
      console.error('Upload failed:', response.status, await response.text());
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Run the test
testMessageUploadFix();