/**
 * This module provides a fixed calculation for user progression based on 
 * the user's team join date rather than the program start date.
 * 
 * The original calculation used a fixed program start date (2/24/2025),
 * but this causes users who joined before that date to have incorrect week numbers.
 */

/**
 * Calculates the user's current week and day based on their team join date
 * @param {Object} user - The user object containing teamJoinedAt property
 * @param {Function} toUserLocalTime - Function to convert UTC time to user's local time
 * @returns {Object} Object containing daysSinceStart, weekNumber, and other calculated values
 */
function calculateUserProgression(user, toUserLocalTime) {
  // Get current time in user's timezone
  const utcNow = new Date();
  const userLocalNow = toUserLocalTime(utcNow);

  // Get start of day in user's timezone
  const userStartOfDay = new Date(userLocalNow);
  userStartOfDay.setHours(0, 0, 0, 0);

  // Calculate user's progress based on their team join date in their local time
  const progressStart = toUserLocalTime(new Date(user.teamJoinedAt));
  
  // Round to start of that day to avoid time discrepancies
  const progressStartDay = new Date(progressStart);
  progressStartDay.setHours(0, 0, 0, 0);
  
  // Calculate days since the user started
  const msSinceStart = userStartOfDay.getTime() - progressStartDay.getTime();
  const daysSinceStart = Math.floor(msSinceStart / (1000 * 60 * 60 * 24));
  
  // Calculate user's week number based on their join date
  const weekNumber = Math.floor(daysSinceStart / 7) + 1;
  
  // Calculate current day of the week
  const rawDay = userLocalNow.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayNumber = rawDay === 0 ? 7 : rawDay; // Convert to 1 = Monday, ..., 7 = Sunday

  // Calculate total days of progress
  const progressDays = Math.floor((userLocalNow.getTime() - progressStart.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    daysSinceStart,
    weekNumber,
    dayNumber,
    progressDays,
    progressStart,
    progressStartDay
  };
}

module.exports = {
  calculateUserProgression
};