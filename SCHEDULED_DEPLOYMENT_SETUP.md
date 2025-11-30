# Scheduled Deployment Setup for Hourly Notifications

## Overview
This app uses Replit's Scheduled Deployments to send hourly notification checks. The scheduled task runs independently from your main web app, so notifications work even when your app scales down to zero.

## How It Works
- **Main App**: Runs your web server (Autoscale or Reserved VM)
- **Scheduled Task**: Runs `scripts/check-notifications.ts` every hour
- **Independence**: The scheduled task doesn't require your web app to be running

## Setup Instructions

### 1. Create a Scheduled Deployment

1. Go to your Replit project
2. Click on the **Deployments** tab
3. Click **Create Deployment**
4. Select **Scheduled Deployment**

### 2. Configure the Scheduled Deployment

**Name**: `Hourly Notification Checker`

**Command**: 
```bash
npx tsx scripts/check-notifications.ts
```

**Schedule**: 
```
0 * * * *
```
This cron expression means "run at minute 0 of every hour" (e.g., 1:00, 2:00, 3:00, etc.)

**Alternative (Natural Language)**:
You can also use Replit's natural language scheduling:
```
every hour
```

### 3. Environment Variables

Make sure your scheduled deployment has access to the same environment variables as your main app:
- `DATABASE_URL` - Required for database access
- Any other secrets your app uses

These should be automatically available if they're configured in your Replit project settings.

### 4. Deploy

Click **Deploy** to start the scheduled task. It will now run every hour automatically.

## Verification

### Check Logs
After the scheduled deployment runs, you can view the logs to verify it's working:

1. Go to **Deployments** tab
2. Click on your **Hourly Notification Checker** deployment
3. View the logs to see output like:
```
[SCHEDULER] Starting notification check at 2025-11-26T15:00:00.000Z
[SCHEDULER] Found 50 users to check
[SCHEDULER] ✅ Created notification for username (ID: 123)
[SCHEDULER] Notification check completed successfully
```

### Monitor in Production
- Scheduled deployments run even when your main app is idle
- Each run is logged separately
- Failed runs will show errors in the deployment logs

## Troubleshooting

### Script Not Running
- Verify the command is correct: `npx tsx scripts/check-notifications.ts`
- Check that the schedule is active
- Review deployment logs for errors

### No Notifications Sent
- Check the script logs to see if users are being processed
- Verify that users have `notificationTime` and `timezoneOffset` set
- Ensure users actually missed their goals (the script only notifies for missed posts)

### Database Connection Issues
- Verify `DATABASE_URL` is available in the scheduled deployment
- Check that the database is accessible from scheduled deployments

## Cost Optimization

Scheduled Deployments only run when triggered:
- **Compute**: Charged only for the duration of each hourly run
- **No idle costs**: Unlike a Reserved VM, you only pay when the script executes
- **Typical duration**: 5-30 seconds per hour depending on user count

## Migration from In-Process Scheduler

If you previously used the in-process scheduler (setInterval), the scheduled deployment approach is better because:
- ✅ Works with Autoscale deployments
- ✅ Doesn't require keeping your web server awake
- ✅ More cost-efficient
- ✅ Separate logs for easier debugging
- ✅ Reliable execution even during app restarts

The in-process scheduler has been removed to prevent duplicate notifications.
