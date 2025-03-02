import { describe, it, expect } from 'vitest';
import { DatabaseStorage } from '../storage';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('getUserWeekInfo', () => {
  const storage = new DatabaseStorage();

  // Helper function to create test user with specific join date
  async function createTestUser(joinDate: Date) {
    const [user] = await db
      .insert(users)
      .values({
        username: 'test',
        email: 'test@example.com',
        password: 'password',
        teamId: 1,
        teamJoinedAt: joinDate
      })
      .returning();
    return user;
  }

  it('calculates first Monday correctly', async () => {
    // Team join on Sunday, first Monday should be next day
    const sundayJoin = new Date('2025-03-02'); // A Sunday
    const user = await createTestUser(sundayJoin);
    const weekInfo = await storage.getUserWeekInfo(user.id);

    expect(weekInfo).not.toBeNull();
    expect(weekInfo?.week).toBe(1);
    expect(weekInfo?.day).toBe(1); // Should show as Monday
  });

  it('maintains Monday (1) to Sunday (7) schedule', async () => {
    // Join on Monday, program starts same day
    const mondayJoin = new Date('2025-03-03'); // A Monday
    const user = await createTestUser(mondayJoin);
    const weekInfo = await storage.getUserWeekInfo(user.id);

    expect(weekInfo).not.toBeNull();
    expect(weekInfo?.day).toBe(1); // Monday should be day 1
  });

  it('shows correct week and day after 9 days', async () => {
    // Join 9 days ago, should be Week 2, Day 2
    const nineDay = new Date();
    nineDay.setDate(nineDay.getDate() - 9);
    const user = await createTestUser(nineDay);
    const weekInfo = await storage.getUserWeekInfo(user.id);

    expect(weekInfo).not.toBeNull();
    expect(weekInfo?.week).toBe(2);
    expect(weekInfo?.day).toBe(2); // Should be Tuesday of Week 2
  });

  it('handles week transitions correctly', async () => {
    // Join 7 days ago (one week)
    const sevenDay = new Date();
    sevenDay.setDate(sevenDay.getDate() - 7);
    const user = await createTestUser(sevenDay);
    const weekInfo = await storage.getUserWeekInfo(user.id);

    expect(weekInfo).not.toBeNull();
    expect(weekInfo?.week).toBe(2); // Should be in week 2
    const today = new Date();
    expect(weekInfo?.day).toBe(today.getDay() === 0 ? 7 : today.getDay()); // Should match today's day
  });

  it('marks Spartan status after 84 days', async () => {
    // Join 83 days ago - not yet Spartan
    const pre83days = new Date();
    pre83days.setDate(pre83days.getDate() - 83);
    const user1 = await createTestUser(pre83days);
    const weekInfo1 = await storage.getUserWeekInfo(user1.id);

    expect(weekInfo1?.isSpartan).toBe(false);

    // Join 84 days ago - now Spartan
    const post84days = new Date();
    post84days.setDate(post84days.getDate() - 84);
    const user2 = await createTestUser(post84days);
    const weekInfo2 = await storage.getUserWeekInfo(user2.id);

    expect(weekInfo2?.isSpartan).toBe(true);
  });

  // Cleanup after each test
  afterEach(async () => {
    await db.delete(users);
  });
});