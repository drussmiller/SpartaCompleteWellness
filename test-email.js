// Simple test script to verify Gmail credentials
import nodemailer from 'nodemailer';

async function testGmailConnection() {
  console.log('Testing Gmail connection...');
  console.log('GMAIL_USER:', process.env.GMAIL_USER);
  console.log('GMAIL_PASSWORD length:', process.env.GMAIL_PASSWORD?.length);
  console.log('GMAIL_PASSWORD (first 4 chars):', process.env.GMAIL_PASSWORD?.substring(0, 4));
  
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASSWORD,
    },
  });

  try {
    // Verify connection
    await transporter.verify();
    console.log('✅ Connection successful!');
    
    // Try sending a test email
    const info = await transporter.sendMail({
      from: `"Test" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER, // Send to self
      subject: 'Test Email',
      text: 'This is a test email to verify Gmail integration works.',
    });
    
    console.log('✅ Email sent successfully:', info.messageId);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

testGmailConnection();
