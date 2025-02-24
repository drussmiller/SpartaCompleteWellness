import sgMail from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable is not set. Email functionality will be disabled.");
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  if (!process.env.SENDGRID_API_KEY) {
    // For development, just log the reset link
    console.log(`[EMAIL SERVICE] Password reset link for ${email}: ${resetLink}`);
    return;
  }

  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: email,
      from: 'noreply@spartawellness.com', // Replace with your verified sender
      subject: 'Reset Your Password - Sparta Complete Wellness',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Reset Your Password</h1>
          <p>You recently requested to reset your password for your Sparta Complete Wellness account. Click the link below to proceed:</p>
          <p style="margin: 20px 0;">
            <a href="${resetLink}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Reset Password
            </a>
          </p>
          <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
          <p>This password reset link will expire in 1 hour.</p>
          <hr style="margin: 20px 0; border: 1px solid #eee;" />
          <p style="color: #666; font-size: 12px;">
            Sparta Complete Wellness - Strengthening Body and Spirit
          </p>
        </div>
      `,
    };

    await sgMail.send(msg);
    console.log(`Password reset email sent successfully to ${email}`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    if (error.response) {
      console.error('SendGrid API error:', error.response.body);
    }
    throw new Error('Failed to send password reset email');
  }
}