# External Cron Service Setup for Hourly Notifications

## Overview
This app uses an **external cron service** (cron-job.org) to trigger hourly notification checks. This approach works perfectly with Autoscale deployments because the external service pings your app every hour, waking it up if needed.

## How It Works
- **External Cron Service**: Calls your app's API endpoint every hour
- **Your App**: Wakes up (if scaled down), checks for missed posts, sends notifications
- **Authentication**: Secured with a secret token to prevent unauthorized access
- **Rate Limiting**: Built-in protection against duplicate or abusive calls

## Setup Instructions

### Step 1: Generate and Configure API Secret

1. **Generate a secure random token** (I've generated one for you):
   ```
   4684826ccff9f16c79d1ff8e2e10ab298f5451e907033578deda84e0d6796620
   ```

2. **Add it as an environment variable** in your Replit project:
   - Go to **Secrets** (Tools > Secrets) in your Replit workspace
   - Add a new secret:
     - **Key**: `NOTIFICATION_CRON_SECRET`
     - **Value**: `4684826ccff9f16c79d1ff8e2e10ab298f5451e907033578deda84e0d6796620`
   - Click **Save**

### Step 2: Get Your App's URL

You'll need your deployed app's URL. It will look like:
```
https://your-app-name.replit.app
```

### Step 3: Set Up Cron-Job.org

1. **Go to**: [cron-job.org](https://cron-job.org)

2. **Create a free account** (no credit card required)

3. **Create a new cron job**:
   - Click **"Create cronjob"**

4. **Configure the job**:

   **Title**: `Team Fitness Tracker - Hourly Notifications`

   **URL**: `https://your-app-name.replit.app/api/check-notifications`
   (Replace `your-app-name` with your actual app URL)

   **Schedule**:
   - Select: **"Every hour"** or use custom schedule
   - Advanced: `0 * * * *` (runs at :00 minutes of every hour)

   **Request Method**: `POST`

   **Request Headers**: Click **"Add header"**
   - **Header Name**: `X-Job-Token`
   - **Header Value**: `4684826ccff9f16c79d1ff8e2e10ab298f5451e907033578deda84e0d6796620`

   **Expected Response**:
   - Status code: `200`
   - You can add response validation if desired

5. **Save and Enable** the cron job

### Step 4: Test the Setup

#### Manual Test via Curl
You can test the endpoint manually:

```bash
curl -X POST https://your-app-name.replit.app/api/check-notifications \
  -H "X-Job-Token: 4684826ccff9f16c79d1ff8e2e10ab298f5451e907033578deda84e0d6796620" \
  -H "Content-Type: application/json"
```

**Expected Response** (success):
```json
{
  "success": true,
  "notificationsCreated": 5,
  "smsNotificationsSent": 2,
  "usersChecked": 50,
  "timestamp": "2025-11-27T10:00:00.000Z"
}
```

**Expected Response** (rate limited):
```json
{
  "success": true,
  "skipped": true,
  "message": "Check skipped - too soon since last run",
  "lastCheck": "2025-11-27T09:15:00.000Z"
}
```

#### Test via Cron-Job.org
After setting up the cron job:
1. Go to your cron job in cron-job.org
2. Click **"Run now"** to trigger it immediately
3. Check the **Execution History** to see if it succeeded
4. Check your app logs to verify notifications were sent

## Security Features

### Authentication
- Uses **header-based token authentication** (X-Job-Token)
- Token validated using **timing-safe comparison** (prevents timing attacks)
- Unauthorized requests are rejected with 401 status

### Rate Limiting
- Built-in protection: won't run more than once per 50 minutes
- Prevents duplicate or abusive calls
- Returns "skipped" response if called too frequently

### Best Practices
- ✅ Secret token stored in environment variables (never in code)
- ✅ HTTPS enforced (Replit deployments use HTTPS by default)
- ✅ Token sent in header (not query params, which could be logged)
- ✅ Timing-safe comparison prevents timing attacks

## Monitoring

### View Logs in Replit
1. Go to your **Deployments** tab
2. Click on your active deployment
3. View **Logs** to see notification check results

Look for log entries like:
```
[CRON] Starting notification check at 2025-11-27T10:00:00.000Z
[SCHEDULER] Found 50 users to check
[SCHEDULER] ✅ Created notification for username (ID: 123)
[SCHEDULER] 📱 Sent SMS to username at +1234567890
[SCHEDULER] ✅ Notification check completed successfully
```

### View Execution History in Cron-Job.org
1. Go to your cron job
2. Click **"Execution History"**
3. See all past runs, response times, and status codes
4. Set up email alerts for failures (optional)

## Troubleshooting

### Cron Job Fails with 401 Unauthorized
- **Check**: Token in cron-job.org matches the one in Replit Secrets
- **Verify**: Header name is exactly `X-Job-Token` (case-sensitive)
- **Ensure**: NOTIFICATION_CRON_SECRET is set in Replit environment

### Cron Job Fails with 500 Error
- **Check**: NOTIFICATION_CRON_SECRET is configured in Replit
- **View**: App logs in Replit to see the error
- **Verify**: Database is accessible

### No Notifications Sent (200 OK but 0 created)
- **Check**: Users have `notificationTime` and `timezoneOffset` set
- **Verify**: Users actually missed their goals (script only notifies for missed posts)
- **Review**: User settings for `dailyNotificationsEnabled` (must be true)

### "Check skipped" Response
- **Normal**: This means the check ran less than 50 minutes ago
- **Wait**: The hourly cron will automatically trigger the next run
- **Note**: This is a safety feature, not an error

## Cost Considerations

### Cron-Job.org
- **Free tier**: Unlimited jobs, runs every minute minimum
- **No credit card required**: Perfect for this use case
- **Alternatives**: You can use any cron service (EasyCron, CloudCron, etc.)

### Replit Autoscale
- **Wake-up calls**: Each hourly ping wakes your app (if sleeping)
- **Compute time**: Charged only while app is processing (typically 5-30 seconds per hour)
- **Cost-efficient**: Much cheaper than keeping a Reserved VM running 24/7
- **Your Credits**: $25/month in Replit Core credits should easily cover this

## Advantages of This Approach

✅ **Works with Autoscale** - App can scale to zero between pings  
✅ **Cost-efficient** - Only pays for compute time when running  
✅ **Reliable** - External service guaranteed to trigger  
✅ **Free** - Cron-job.org is free for this use case  
✅ **Easy monitoring** - Both services provide logs and history  
✅ **Secure** - Token-based authentication with rate limiting  
✅ **No Replit Core required** - Works with any subscription level  

## Migration Notes

This replaces the previous in-process scheduler approach which didn't work with Autoscale deployments (since the app scales to zero after 15 minutes of inactivity, stopping the internal timer).

The API endpoint has been added, and the notification logic is ready to use. You just need to:
1. Add the secret to Replit
2. Set up the cron job on cron-job.org
3. Test it works!
