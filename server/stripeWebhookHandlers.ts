import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { users } from '@shared/schema';
import { sql } from 'drizzle-orm';

export class StripeWebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const stripe = await getUncachableStripeClient();
    const sync = await getStripeSync();

    const webhookSecret = await sync.getWebhookSecret();
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      
      if (session.metadata?.donationType === 'autonomous_mode_unlock' && 
          session.payment_status === 'paid') {
        await this.handleDonationSuccess(session);
      }
    }

    await sync.processWebhook(payload, signature);
  }

  static async handleDonationSuccess(session: any): Promise<void> {
    const customerEmail = session.customer_email || session.metadata?.email;
    
    if (!customerEmail) {
      console.log('[Stripe Donation] No email found in checkout session, cannot match to user');
      return;
    }

    console.log(`[Stripe Donation] Processing successful donation from: ${customerEmail}`);

    const result = await db
      .update(users)
      .set({
        hasDonated: true,
        donatedAt: new Date(),
      })
      .where(sql`LOWER(${users.email}) = LOWER(${customerEmail})`)
      .returning({ id: users.id, username: users.username });

    if (result.length > 0) {
      console.log(`[Stripe Donation] Successfully marked user ${result[0].username} (ID: ${result[0].id}) as donor`);
    } else {
      console.log(`[Stripe Donation] No user found with email: ${customerEmail}`);
    }
  }
}
