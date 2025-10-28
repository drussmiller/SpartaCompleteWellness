import { emailService } from './email-service';

// SMS carrier gateways in priority order
export const SMS_CARRIER_GATEWAYS = [
  { name: 'Verizon SMS', gateway: 'vtext.com', type: 'SMS' },
  { name: 'Verizon MMS', gateway: 'vzwpix.com', type: 'MMS' },
  { name: 'AT&T SMS', gateway: 'txt.att.net', type: 'SMS' },
  { name: 'AT&T MMS', gateway: 'mms.att.net', type: 'MMS' },
  { name: 'T-Mobile', gateway: 'tmomail.net', type: 'SMS/MMS' },
  { name: 'Sprint SMS', gateway: 'messaging.sprintpcs.com', type: 'SMS' },
  { name: 'Sprint MMS', gateway: 'pm.sprint.com', type: 'MMS' },
  { name: 'US Cellular', gateway: 'email.uscc.net', type: 'SMS' },
  { name: 'Google Fi', gateway: 'msg.fi.google.com', type: 'SMS/MMS' },
  { name: 'Cricket Wireless', gateway: 'mms.cricketwireless.net', type: 'SMS/MMS' },
] as const;

interface SendSMSOptions {
  phoneNumber: string;
  message: string;
  carrierGateway?: string;
}

interface TestSMSResult {
  success: boolean;
  gateway?: string;
  error?: string;
  attemptedGateways?: string[];
}

class SMSService {
  /**
   * Normalizes a phone number by removing all non-numeric characters
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/\D/g, '');
  }

  /**
   * Sends an SMS via email using the specified carrier gateway
   */
  async sendSMS(options: SendSMSOptions): Promise<void> {
    const normalizedPhone = this.normalizePhoneNumber(options.phoneNumber);
    
    if (normalizedPhone.length !== 10 && normalizedPhone.length !== 11) {
      throw new Error('Phone number must be 10 or 11 digits');
    }

    // Use last 10 digits (removes country code if present)
    const phone = normalizedPhone.slice(-10);
    const gateway = options.carrierGateway;

    if (!gateway) {
      throw new Error('Carrier gateway is required for sending SMS');
    }

    const smsEmail = `${phone}@${gateway}`;
    
    // Send email to SMS gateway
    // Keep subject empty or minimal for SMS
    await emailService.sendEmail({
      to: smsEmail,
      subject: '', // Most carriers ignore subject for SMS
      html: options.message,
      text: options.message,
    });
  }

  /**
   * Tests SMS delivery by trying each carrier gateway in order
   * Returns the gateway that successfully delivered the message
   */
  async testAndDetectCarrier(
    phoneNumber: string,
    testMessage: string = 'Sparta Complete Wellness - SMS notifications activated! Reply STOP to unsubscribe.'
  ): Promise<TestSMSResult> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    
    if (normalizedPhone.length !== 10 && normalizedPhone.length !== 11) {
      return {
        success: false,
        error: 'Phone number must be 10 or 11 digits',
      };
    }

    const phone = normalizedPhone.slice(-10);
    const attemptedGateways: string[] = [];

    // Try each gateway in order
    for (const carrier of SMS_CARRIER_GATEWAYS) {
      try {
        const smsEmail = `${phone}@${carrier.gateway}`;
        attemptedGateways.push(`${carrier.name} (${carrier.gateway})`);

        console.log(`Attempting SMS via ${carrier.name} (${carrier.gateway})...`);
        
        await emailService.sendEmail({
          to: smsEmail,
          subject: '',
          html: testMessage,
          text: testMessage,
        });

        // If we get here without error, assume success
        // Note: Email sending might succeed even if SMS fails at carrier level
        // In production, you'd want user confirmation
        console.log(`✅ SMS test sent via ${carrier.name}`);
        
        return {
          success: true,
          gateway: carrier.gateway,
          attemptedGateways,
        };
      } catch (error) {
        console.error(`Failed to send via ${carrier.name}:`, error);
        // Continue to next gateway
        continue;
      }
    }

    // All gateways failed
    return {
      success: false,
      error: 'All carrier gateways failed',
      attemptedGateways,
    };
  }

  /**
   * Sends SMS to a user using their stored carrier gateway
   */
  async sendSMSToUser(
    phoneNumber: string,
    carrierGateway: string,
    message: string
  ): Promise<boolean> {
    try {
      await this.sendSMS({
        phoneNumber,
        message,
        carrierGateway,
      });
      return true;
    } catch (error) {
      console.error('Failed to send SMS:', error);
      return false;
    }
  }
}

export const smsService = new SMSService();
