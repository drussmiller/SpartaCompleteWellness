/**
 * Scheduled Notification Script
 * 
 * This script is designed to be run by Replit's Scheduled Deployments.
 * It calls the /api/check-daily-scores endpoint to send daily reminder 
 * notifications to users who haven't completed their daily tasks.
 * 
 * The endpoint checks each user's notification time preference and only
 * sends notifications within a 10-minute window of their chosen time.
 */

import { logger } from "./logger";

async function runScheduledNotifications() {
  try {
    logger.info("Starting scheduled daily notification check");
    
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getMinutes();
    
    logger.info(`Current UTC time: ${currentHour}:${String(currentMinute).padStart(2, '0')}`);
    
    // Call the check-daily-scores endpoint
    // This endpoint will check all users and send notifications to those
    // whose notification time matches the current time
    const response = await fetch('http://localhost:5000/api/check-daily-scores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentHour,
        currentMinute,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Failed to check daily scores: ${response.status} ${response.statusText}`, errorText);
      process.exit(1);
    }
    
    const result = await response.json();
    logger.info(`Scheduled notification check complete:`, result);
    
    process.exit(0);
    
  } catch (error) {
    logger.error("Error in scheduled notification check:", error);
    process.exit(1);
  }
}

// Run the scheduled task
runScheduledNotifications();
