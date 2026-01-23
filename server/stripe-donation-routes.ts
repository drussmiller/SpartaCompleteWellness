import express, { Router, Request, Response } from 'express';
import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient';
import { authenticate } from './auth';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

export const stripeDonationRouter = Router();

stripeDonationRouter.get('/api/stripe/publishable-key', async (req: Request, res: Response) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error: any) {
    console.error('[Stripe] Error getting publishable key:', error);
    res.status(500).json({ error: 'Failed to get Stripe configuration' });
  }
});

stripeDonationRouter.post('/api/stripe/create-payment-intent', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { amount } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Minimum donation amount is $1.00' });
    }

    const stripe = await getUncachableStripeClient();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      metadata: {
        userId: String(user.id),
        email: user.email,
        donationType: 'autonomous_mode_unlock',
      },
      description: 'Sparta Complete Wellness Sponsorship Donation',
    });

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id 
    });
  } catch (error: any) {
    console.error('[Stripe] Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

stripeDonationRouter.post('/api/stripe/confirm-donation', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    const stripe = await getUncachableStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment has not been completed' });
    }

    if (paymentIntent.metadata?.userId !== String(user.id)) {
      return res.status(403).json({ error: 'Payment does not belong to this user' });
    }

    await db.update(users)
      .set({ 
        hasDonated: true, 
        donatedAt: new Date() 
      })
      .where(eq(users.id, user.id));

    console.log(`[Stripe] User ${user.id} (${user.email}) donation confirmed via embedded form`);

    res.json({ success: true, message: 'Donation confirmed! You can now create your own team.' });
  } catch (error: any) {
    console.error('[Stripe] Error confirming donation:', error);
    res.status(500).json({ error: 'Failed to confirm donation' });
  }
});
