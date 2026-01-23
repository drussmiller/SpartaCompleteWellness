import express, { Router, Request, Response } from 'express';
import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient';
import { authenticate } from './auth';

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

stripeDonationRouter.post('/api/stripe/create-donation-checkout', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { amount } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Minimum donation amount is $1.00' });
    }

    const stripe = await getUncachableStripeClient();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Sparta Complete Wellness Sponsorship Donation',
              description: 'Support the Sparta Complete Wellness program and unlock the ability to create your own team.',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.protocol}://${req.get('host')}/donation-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/invite-code`,
      customer_email: user.email,
      metadata: {
        userId: String(user.id),
        email: user.email,
        donationType: 'autonomous_mode_unlock',
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error('[Stripe] Error creating donation checkout:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

stripeDonationRouter.get('/api/stripe/donation-session/:sessionId', authenticate, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const stripe = await getUncachableStripeClient();

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    res.json({
      status: session.payment_status,
      amountTotal: session.amount_total,
      customerEmail: session.customer_email,
    });
  } catch (error: any) {
    console.error('[Stripe] Error retrieving session:', error);
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
});
