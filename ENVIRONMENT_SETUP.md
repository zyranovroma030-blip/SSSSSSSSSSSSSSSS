# Environment Variables for Vercel Deployment

## Required Environment Variables

Add these in your Vercel project dashboard: Project → Settings → Environment Variables

### 1. TELEGRAM_BOT_TOKEN
- **Description**: Bot token from Telegram BotFather
- **How to get**: 
  1. Talk to @BotFather in Telegram
  2. Create new bot with `/newbot`
  3. Copy the token
- **Example**: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

### 2. NEXT_PUBLIC_APP_URL (Optional)
- **Description**: Your deployed app URL
- **Example**: `https://your-app.vercel.app`

## Setup Instructions

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add the variables above
4. Redeploy your project

## Testing

After deployment, test the Telegram notifications:
1. Set up your Telegram Chat ID in the app
2. Create a smart alert with low threshold
3. Wait for the next check (every 1 minute via cron job)

## Cron Job Schedule

The smart alerts are checked automatically every 1 minute via Vercel cron job:
- Schedule: `* * * * *` (every minute)
- Endpoint: `/api/check-smart-alerts`
- Works 24/7 even when site is closed

## Troubleshooting

### If notifications don't work:
1. Check that `TELEGRAM_BOT_TOKEN` is set correctly
2. Verify your Telegram Chat ID in the app
3. Check Vercel function logs for errors
4. Test the API endpoint directly: `https://your-app.vercel.app/api/notify`

### Logs Location:
- Vercel Dashboard → Functions → Logs
- Look for `[Background]` and `[Telegram]` log entries
