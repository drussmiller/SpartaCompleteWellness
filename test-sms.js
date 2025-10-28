// Test SMS sending for Russ
import fetch from 'node-fetch';

const phoneNumber = '9729787871';

async function testSMS() {
  console.log('Testing SMS carrier detection for:', phoneNumber);
  
  try {
    // First, detect carrier
    const testResponse = await fetch('http://localhost:5000/api/user/sms/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=your-session-id' // We'll need to get this from a real session
      },
      body: JSON.stringify({ phoneNumber })
    });
    
    console.log('Test response status:', testResponse.status);
    const testResult = await testResponse.json();
    console.log('Test result:', testResult);
    
    if (testResult.success) {
      console.log('\n✅ Carrier detected:', testResult.gateway);
      console.log('Check your phone for the test message!');
      console.log('Check Gmail sent folder for the email to:', `${phoneNumber}@${testResult.gateway}`);
    } else {
      console.log('❌ Failed to detect carrier');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testSMS();
