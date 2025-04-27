/**
 * Weekly Progression Calculator
 * 
 * This utility replaces the original program start date calculation
 * with a calculation based on the first Monday after the user's team join date.
 * 
 * It fixes an issue where users who joined before the program's official
 * start date (2/24/2025) would have incorrect week numbers displayed.
 */

/**
 * Find the first Monday after a given date
 * 
 * @param {Date} date - The reference date
 * @returns {Date} The first Monday after or on the reference date
 */
export function getFirstMondayAfterDate(date) {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // If today is already Monday, use today
  if (dayOfWeek === 1) {
    return new Date(date);
  }
  
  // Calculate days to add to get to next Monday
  // If Sunday (0), add 1 day; if Tuesday (2), add 6 days; etc.
  const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  
  // Create a new date for the next Monday
  const firstMonday = new Date(date);
  firstMonday.setDate(date.getDate() + daysToAdd);
  
  return firstMonday;
}

/**
 * Calculates the user's current week and day based on the first Monday
 * after their team join date
 * 
 * @param {Object} user - User object containing teamJoinedAt property
 * @param {Function} toUserLocalTime - Function to convert UTC time to user's local time
 * @returns {Object} Object with progression data (weekNumber, dayNumber, etc.)
 */
export function calculateUserProgression(user, toUserLocalTime) {
  // Get current time in user's timezone
  const utcNow = new Date();
  const userLocalNow = toUserLocalTime(utcNow);

  // Get start of day in user's timezone
  const userStartOfDay = new Date(userLocalNow);
  userStartOfDay.setHours(0, 0, 0, 0);

  // Calculate user's progress based on their team join date in their local time
  const joinDate = toUserLocalTime(new Date(user.teamJoinedAt));
  
  // Round to start of that day to avoid time discrepancies
  const joinDateStartOfDay = new Date(joinDate);
  joinDateStartOfDay.setHours(0, 0, 0, 0);
  
  // Get the first Monday after the join date (or the join date itself if it's a Monday)
  const programStartDay = getFirstMondayAfterDate(joinDateStartOfDay);
  programStartDay.setHours(0, 0, 0, 0);
  
  // Calculate days since program start (the first Monday)
  const msSinceStart = userStartOfDay.getTime() - programStartDay.getTime();
  const daysSinceStart = Math.floor(msSinceStart / (1000 * 60 * 60 * 24));
  
  // Calculate user's week number based on first Monday after join date
  // Week 1 starts on that first Monday
  const weekNumber = Math.floor(daysSinceStart / 7) + 1;
  
  // Calculate current day of the week
  const rawDay = userLocalNow.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayNumber = rawDay === 0 ? 7 : rawDay; // Convert to 1 = Monday, ..., 7 = Sunday

  // Calculate total days of progress (from join date, not first Monday)
  const progressDays = Math.floor((userLocalNow.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
  const progressStart = joinDate;
  
  return {
    daysSinceStart,
    weekNumber,
    dayNumber,
    progressDays,
    progressStart,
    programStartDay,
    utcNow,
    userLocalNow,
    userStartOfDay,
    joinDateStartOfDay
  };
};