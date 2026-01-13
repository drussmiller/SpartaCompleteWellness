import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from './db';
import { users } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from './logger';
import express from 'express';

export const donorboxWebhookRouter = Router();

interface DonorboxDonor {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
}

interface DonorboxDonation {
  id: number;
  amount: string;
  formatted_amount: string;
  currency: string;
  status: string;
  donation_date: string;
  donor: DonorboxDonor;
  campaign?: {
    id: number;
    name: string;
  };
}

interface DonorboxWebhookPayload {
  event_id: number;
  event_name: string;
  created_at: string;
  donation: DonorboxDonation;
}

function verifyDonorboxSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) {
    return false;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

donorboxWebhookRouter.post(
  '/api/webhooks/donorbox',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    try {
      const webhookSecret = process.env.DONORBOX_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        logger.error('DONORBOX_WEBHOOK_SECRET is not configured');
        return res.status(500).json({ message: 'Webhook not configured' });
      }
      
      const signature = req.headers['x-donorbox-signature'] as string | undefined;
      const rawBody = req.body as Buffer;
      
      if (!verifyDonorboxSignature(rawBody, signature, webhookSecret)) {
        logger.warn('Invalid Donorbox webhook signature');
        return res.status(401).json({ message: 'Invalid signature' });
      }
      
      const payload: DonorboxWebhookPayload = JSON.parse(rawBody.toString());
      
      if (payload.event_name !== 'donation.created') {
        logger.info(`Ignoring Donorbox event: ${payload.event_name}`);
        return res.status(200).json({ message: 'Event ignored' });
      }
      
      const donorEmail = payload.donation?.donor?.email?.toLowerCase();
      
      if (!donorEmail) {
        logger.warn('Donorbox donation.created event missing donor email', { event_id: payload.event_id });
        return res.status(200).json({ message: 'No donor email in payload' });
      }
      
      logger.info(`Processing donation for: ${donorEmail}`, {
        event_id: payload.event_id,
        amount: payload.donation.formatted_amount,
        donor_name: payload.donation.donor.name,
      });
      
      const [matchedUser] = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = ${donorEmail}`)
        .limit(1);
      
      if (!matchedUser) {
        logger.warn(`No user found for donor email: ${donorEmail}`, { event_id: payload.event_id });
        return res.status(200).json({ message: 'User not found for donor email' });
      }
      
      await db
        .update(users)
        .set({
          hasDonated: true,
          donatedAt: new Date(),
        })
        .where(eq(users.id, matchedUser.id));
      
      logger.info(`User ${matchedUser.id} (${matchedUser.email}) marked as donor`, {
        event_id: payload.event_id,
        amount: payload.donation.formatted_amount,
      });
      
      return res.status(200).json({ 
        message: 'Donation processed successfully',
        userId: matchedUser.id,
      });
      
    } catch (error) {
      logger.error('Error processing Donorbox webhook:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);
