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