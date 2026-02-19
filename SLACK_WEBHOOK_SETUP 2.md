# Slack Webhook Setup for P³ Lending

This guide will help you set up Slack webhook notifications for the P³ Lending platform.

## Prerequisites

- A Slack workspace where you have admin permissions
- Access to the P³ Lending codebase

## Step 1: Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"** → **"From scratch"**
3. Enter app name: `P³ Lending Bot`
4. Select your workspace
5. Click **"Create App"**

## Step 2: Configure Incoming Webhooks

1. In your app settings, go to **"Incoming Webhooks"** in the left sidebar
2. Toggle **"Activate Incoming Webhooks"** to **On**
3. Click **"Add New Webhook to Workspace"**
4. Choose the channel where you want notifications (e.g., `#general`, `#alerts`, `#p3-lending`)
5. Click **"Allow"**
6. Copy the webhook URL (starts with `https://hooks.slack.com/services/...`)

## Step 3: Configure Environment Variables

### Client-side notifications (optional)

1. Open `config.ts` in your project.
2. Update the `SLACK_WEBHOOK_URL` and other settings:

```typescript
export const CONFIG = {
  // ... other config
  SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/YOUR/ACTUAL/WEBHOOK/URL',
  SLACK_CHANNEL: '#p3-lending',
  SLACK_USERNAME: 'P3 Lending Bot',
  SLACK_ICON_EMOJI: ':robot_face:'
};
```

### Netlify function env vars (required for slash commands)

Set these in Netlify Site Settings -> Environment variables:

- `SLACK_SIGNING_SECRET` = Signing Secret from Slack App -> Basic Information
- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` = service role key (used to read `loan_activity` for `/loan-status`)

## Step 4: Configure Slash Commands

1. **Go to "Slash Commands"** in your Slack app settings
2. **Click "Create New Command"**

#### Command 1: Loan Status
- **Command**: `/loan-status`
- **Request URL**: `https://p3lending.netlify.app/slack/webhook`
- **Short Description**: `Check loan status and details`
- **Usage Hint**: `[loan-id]`

#### Command 2: Tip
- **Command**: `/tip`
- **Request URL**: `https://p3lending.netlify.app/slack/webhook`
- **Short Description**: `Send micro-transaction tip to another user`
- **Usage Hint**: `[@user] [amount] [message]`

3. **Save each command**

## Step 5: Test Slash Commands

After deploy, run from Slack:

- `/loan-status <loan-id>` -> reads from `loan_activity` and returns status/details
- `/tip @user <amount> [message]` -> posts an in-channel tip message

If either command fails with auth errors, re-check `SLACK_SIGNING_SECRET`.

## Step 6: Test Incoming Webhook Notifications

You can use the built-in hooks to test notifications.

### Using the React Hook

```typescript
import { useSlackNotifications } from './hooks/useSlackNotifications';

const MyComponent = () => {
  const { notifyLoanCreated, notifySecurityAlert } = useSlackNotifications();

  const handleLoanCreated = async (loanData) => {
    await notifyLoanCreated({
      amount: 500,
      borrower: '0x1234...5678',
      id: 'LOAN-001',
      purpose: 'Equipment Upgrade'
    });
  };
};
```

### Using the Service Directly

```typescript
import { sendSlackNotification } from './services/slackService';

// Send a custom notification
await sendSlackNotification({
  text: 'Custom notification message',
  type: 'info',
  title: 'Custom Title',
  fields: [
    { title: 'Field 1', value: 'Value 1', short: true },
    { title: 'Field 2', value: 'Value 2', short: true }
  ]
});
```

### Using the Tip Component

The `TipComponent` is ready to be imported and used anywhere in the app to allow users to send tips and notify the Slack channel.

```typescript
import { TipComponent } from './components/TipComponent';

// In your React component
<TipComponent 
  recipientName="Alex Mercer"
  recipientAddress="0x123..." 
  onClose={() => console.log('Closed')}
/>
```

## Notification Colors and Emojis

- **Success** (Green): ✅ - Loan funded, payment received
- **Warning** (Orange): ⚠️ - System degraded, market volatility
- **Error** (Red): 🚨 - Security alerts, system down
- **Info** (Blue): ℹ️ - General information, new loans

## Troubleshooting

### Common Issues

1. **"Invalid webhook URL"**
   - Check that your webhook URL is correct in `config.ts`.
   - Ensure the webhook is activated in your Slack app.

2. **CORS Errors in Browser Console**
   - Slack webhooks do not support CORS preflight requests from browsers. 
   - The service uses `mode: 'no-cors'` to send "opaque" requests. You won't see a success response, but the message will arrive in Slack.
   - For production, use a backend proxy.

3. **Slash command returns `invalid_signature`**
   - Verify the Slack command Request URL is exactly `https://<your-site>/slack/webhook`.
   - Confirm Netlify env var `SLACK_SIGNING_SECRET` matches Slack App Signing Secret.

## Security Considerations

- Never commit your real webhook URL to public version control.
- Use environment variables for all sensitive configuration in a real build environment.