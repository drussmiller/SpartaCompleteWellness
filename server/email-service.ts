import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private lastEmailTime: number = 0;
  private readonly minDelayMs = 1000; // 1 second minimum delay between emails

  private createTransporter() {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
      },
    });
  }

  private async waitForThrottle() {
    const now = Date.now();
    const timeSinceLastEmail = now - this.lastEmailTime;
    
    if (timeSinceLastEmail < this.minDelayMs) {
      const delayNeeded = this.minDelayMs - timeSinceLastEmail;
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
    
    this.lastEmailTime = Date.now();
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    await this.waitForThrottle();

    try {
      const transporter = this.createTransporter();
      
      const mailOptions = {
        from: `"Sparta Complete Wellness" <${process.env.GMAIL_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${options.to}:`, info.messageId);
    } catch (error) {
      console.error(`Failed to send email to ${options.to}:`, error);
      throw new Error('Failed to send email');
    }
  }

  async sendPasswordResetEmail(email: string, temporaryPassword: string): Promise<void> {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .password-box { background-color: #fff; border: 2px solid #4CAF50; padding: 15px; margin: 20px 0; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px; }
          .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset - Sparta Complete Wellness</h1>
          </div>
          <div class="content">
            <h2>Temporary Password</h2>
            <p>You requested a password reset for your Sparta Complete Wellness account.</p>
            <p>Here is your temporary password:</p>
            <div class="password-box">${temporaryPassword}</div>
            <div class="warning">
              <strong>Important Security Notice:</strong>
              <ul>
                <li>This is a temporary password. Please log in and change it immediately.</li>
                <li>For your security, change your password as soon as you log in.</li>
                <li>If you didn't request this password reset, please contact support immediately.</li>
              </ul>
            </div>
            <p>To log in:</p>
            <ol>
              <li>Go to the Sparta Complete Wellness login page</li>
              <li>Enter your email address: <strong>${email}</strong></li>
              <li>Use the temporary password shown above</li>
              <li>Immediately change your password in your profile settings</li>
            </ol>
          </div>
          <div class="footer">
            <p>This email was sent by Sparta Complete Wellness App</p>
            <p>If you didn't request this password reset, please ignore this email or contact support.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Password Reset - Sparta Complete Wellness',
      html: htmlContent,
    });
  }
}

export const emailService = new EmailService();
