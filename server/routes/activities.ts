import { Router } from 'express';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { activities } from '@shared/schema';
import { storage } from '../storage';

const router = Router();

// Middleware to check admin status
const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.user?.isAdmin) return res.sendStatus(403);
  next();
};

// Create activity
router.post('/', requireAdmin, async (req, res) => {
  try {
    const activity = await storage.createActivity(req.body);
    res.status(201).json(activity);
  } catch (error) {
    res.status(500).json({ error: "Failed to create activity" });
  }
});

// Update activity
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const activity = await db
      .update(activities)
      .set(req.body)
      .where(eq(activities.id, parseInt(req.params.id)))
      .returning();
    res.json(activity[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to update activity" });
  }
});

// Delete activity
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const activityId = parseInt(req.params.id);
    await db
      .delete(activities)
      .where(eq(activities.id, activityId));
    res.sendStatus(200);
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ error: "Failed to delete activity" });
  }
});

// Get activities
router.get('/', async (req, res) => {
  const { week, day } = req.query;
  try {
    const activities = await storage.getActivities(
      week ? Number(week) : undefined,
      day ? Number(day) : undefined
    );
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

export default router;
