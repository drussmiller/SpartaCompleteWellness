import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseStorage } from '../storage';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('getUserWeekInfo', () => {
  const storage = new DatabaseStorage();

  // Mock Date.now() to return March 2, 2025
  beforeEach(() => {
    const mockDate = new Date('2025-03-02T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
    db.delete(users);
  });

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

  it('returns null when joining on Sunday before program starts', async () => {
    // Join on Sunday March 2, 2025
    const sundayJoin = new Date('2025-03-02T00:00:00.000Z');
    const user = await createTestUser(sundayJoin);
    const weekInfo = await storage.getUserWeekInfo(user.id);

    expect(weekInfo).toBeNull();
  });

  it('starts program on first Monday after joining', async () => {
    // Set current date to Monday March 3, 2025
    vi.setSystemTime(new Date('2025-03-03T00:00:00.000Z'));

    // User joined yesterday (Sunday)
    const sundayJoin = new Date('2025-03-02T00:00:00.000Z');
    const user = await createTestUser(sundayJoin);
    const weekInfo = await storage.getUserWeekInfo(user.id);

    expect(weekInfo).not.toBeNull();
    expect(weekInfo?.week).toBe(1);
    expect(weekInfo?.day).toBe(1); // Should be Monday = Day 1
  });

  it('calculates Week 2 Day 2 correctly after 9 days', async () => {
    // Set current date to March 11, 2025 (9 days after March 2)
    vi.setSystemTime(new Date('2025-03-11T00:00:00.000Z'));

    // User joined on March 2
    const joinDate = new Date('2025-03-02T00:00:00.000Z');
    const user = await createTestUser(joinDate);
    const weekInfo = await storage.getUserWeekInfo(user.id);

    expect(weekInfo).not.toBeNull();
    expect(weekInfo?.week).toBe(2);
    expect(weekInfo?.day).toBe(2); // Should be Tuesday = Day 2
  });

  it('marks Spartan status after 84 days', async () => {
    // Set current date to May 24, 2025 (83 days after March 2)
    vi.setSystemTime(new Date('2025-05-24T00:00:00.000Z'));

    // User joined on March 2
    const user1 = await createTestUser(new Date('2025-03-02T00:00:00.000Z'));
    const weekInfo1 = await storage.getUserWeekInfo(user1.id);

    expect(weekInfo1?.isSpartan).toBe(false);

    // Set current date to May 25, 2025 (84 days after March 2)
    vi.setSystemTime(new Date('2025-05-25T00:00:00.000Z'));
    const weekInfo2 = await storage.getUserWeekInfo(user1.id);

    expect(weekInfo2?.isSpartan).toBe(true);
  });
});