import twilio from 'twilio';

interface SendSMSOptions {
  phoneNumber: string;
  message: string;
}

class SMSService {
  private twilioClient: twilio.Twilio | null = null;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (accountSid && authToken) {
      this.twilioClient = twilio(accountSid, authToken);
      console.log('✅ Twilio SMS service initialized');
    } else {
      console.warn('⚠️ Twilio credentials not found. SMS functionality will be disabled.');
    }
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    } else if (phoneNumber.startsWith('+') && cleaned.length >= 10) {
      return phoneNumber;
    }
    
    throw new Error(`Invalid phone number format. Expected 10 or 11 digits, got ${cleaned.length} digits.`);
  }

  async sendSMS(options: SendSMSOptions): Promise<void> {
    if (!this.twilioClient) {
      throw new Error('Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    }

    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!twilioPhoneNumber) {
      throw new Error('TWILIO_PHONE_NUMBER is not configured.');
    }

    const normalizedPhone = this.normalizePhoneNumber(options.phoneNumber);

    try {
      const message = await this.twilioClient.messages.create({
        body: options.message,
        from: twilioPhoneNumber,
        to: normalizedPhone,
      });

      console.log(`✅ SMS sent successfully to ${normalizedPhone}. Message SID: ${message.sid}`);
    } catch (error) {
      console.error(`Failed to send SMS to ${normalizedPhone}:`, error);
      throw new Error('Failed to send SMS via Twilio');
    }
  }

  async sendSMSToUser(
    phoneNumber: string,
    message: string
  ): Promise<void> {
    await this.sendSMS({
      phoneNumber,
      message,
    });
  }

  async testSMS(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.sendSMS({
        phoneNumber,
        message: 'Sparta Complete Wellness - SMS notifications activated! Reply STOP to unsubscribe.',
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const smsService = new SMSService();
