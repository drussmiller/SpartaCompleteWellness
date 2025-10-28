import { smsService } from './server/sms-service';
import { db } from './server/db';
import { users } from './shared/schema';
import { eq } from 'drizzle-orm';

async function sendTestSMS() {
  const phoneNumber = '9729787871';
  const userId = 9; // Russ's user ID
  
  console.log('🔍 Testing SMS carrier detection for phone:', phoneNumber);
  console.log('');
  
  // Test carrier detection
  const result = await smsService.testAndDetectCarrier(
    phoneNumber,
    'Test from Sparta Complete Wellness! SMS notifications are working. Reply STOP to unsubscribe.'
  );
  
  console.log('');
  console.log('📋 Test Results:');
  console.log('═'.repeat(60));
  console.log('Success:', result.success);
  
  if (result.success && result.gateway) {
    console.log('✅ Carrier Gateway Detected:', result.gateway);
    console.log('📧 Email sent to:', `${phoneNumber}@${result.gateway}`);
    console.log('');
    console.log('💾 Updating database...');
    
    // Update user's carrier gateway in database
    await db
      .update(users)
      .set({
        phoneNumber,
        smsCarrierGateway: result.gateway,
        smsEnabled: true,
      })
      .where(eq(users.id, userId));
    
    console.log('✅ Database updated successfully!');
    console.log('');
    console.log('📱 Check your phone for the SMS!');
    console.log('📧 Check Gmail sent folder for email to:', `${phoneNumber}@${result.gateway}`);
  } else {
    console.log('❌ Failed to detect carrier');
    console.log('Error:', result.error);
    console.log('');
    console.log('Attempted gateways:');
    result.attemptedGateways?.forEach((gw, i) => {
      console.log(`  ${i + 1}. ${gw}`);
    });
  }
  
  console.log('═'.repeat(60));
  process.exit(0);
}

sendTestSMS().catch(error => {
  console.error('💥 Error:', error);
  process.exit(1);
});
