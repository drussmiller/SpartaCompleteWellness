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
        await this.handleDonationSuccess(session.customer_email || session.metadata?.email, session.metadata?.userId);
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as any;
      
      if (paymentIntent.metadata?.donationType === 'autonomous_mode_unlock') {
        await this.handleDonationSuccess(paymentIntent.metadata?.email, paymentIntent.metadata?.userId);
      }
    }

    await sync.processWebhook(payload, signature);
  }

  static async handleDonationSuccess(email: string | undefined, userId: string | undefined): Promise<void> {
    if (!email && !userId) {
      console.log('[Stripe Donation] No email or userId found, cannot match to user');
      return;
    }

    console.log(`[Stripe Donation] Processing successful donation - email: ${email}, userId: ${userId}`);

    let result;
    if (userId) {
      result = await db
        .update(users)
        .set({
          hasDonated: true,
          donatedAt: new Date(),
        })
        .where(sql`${users.id} = ${parseInt(userId)}`)
        .returning({ id: users.id, username: users.username });
    } else if (email) {
      result = await db
        .update(users)
        .set({
          hasDonated: true,
          donatedAt: new Date(),
        })
        .where(sql`LOWER(${users.email}) = LOWER(${email})`)
        .returning({ id: users.id, username: users.username });
    }

    if (result && result.length > 0) {
      console.log(`[Stripe Donation] Successfully marked user ${result[0].username} (ID: ${result[0].id}) as donor via webhook`);
    } else {
      console.log(`[Stripe Donation] No user found with email: ${email} or userId: ${userId}`);
    }
  }
}
