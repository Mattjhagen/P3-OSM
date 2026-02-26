# Slack Slash Commands (P3 Lending)

P3 exposes Slack slash commands via a signed webhook so your workspace can query loan status and use the tip command. The same endpoint works with Slack’s Slash Commands UI and with the Slack MCP when you want to drive actions from Cursor.

## Endpoint

- **URL:** `https://p3lending.space/slack/webhook`
- **Method:** `POST`
- **Auth:** Slack signing secret (see below).

## Environment

In Netlify (or your host), set:

| Variable | Description |
|----------|-------------|
| `SLACK_SIGNING_SECRET` | From Slack App → Basic Information → Signing Secret. Required for request verification. |
| `SUPABASE_URL` | (For `/loan-status`) Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | (For `/loan-status`) Service role key for reading `loan_activity`. |

## Configuring Slash Commands in Slack

1. Go to [Slack API](https://api.slack.com/apps) and open your app (or create one).
2. **Slash Commands** → **Create New Command** for each command:

| Command | Request URL | Short Description |
|---------|-------------|--------------------|
| `/loan-status` | `https://p3lending.space/slack/webhook` | Look up a loan by ID |
| `/tip` | `https://p3lending.space/slack/webhook` | Tip a user (in-channel) |
| `/help` | `https://p3lending.space/slack/webhook` | List P3 slash commands |

3. **Basic Information** → **Signing Secret** → copy the value into Netlify as `SLACK_SIGNING_SECRET`.
4. Install the app to your workspace (**Install App**).

Slack will send `POST` requests with `application/x-www-form-urlencoded` body; the function verifies `X-Slack-Signature` and responds with JSON (including `blocks` when used).

## Commands

### `/help`

Shows an ephemeral message with all supported commands and usage.

- **Usage:** `/help`

### `/loan-status <loan-id>`

Returns loan details from P3 (Supabase `loan_activity`). Response is ephemeral.

- **Usage:** `/loan-status <loan-id>`
- **Example:** `/loan-status abc-123-def`

### `/tip @user <amount> [message]`

Posts a tip message in the channel. No money movement; display only.

- **Usage:** `/tip @recipient <amount> [message]`
- **Example:** `/tip @alice 10.50 Thanks!`

## Using with Slack MCP

If you use the Slack MCP in Cursor:

- The **slash commands** above are handled by this webhook (Slack sends requests to `https://p3lending.space/slack/webhook`). You do not need to change the Request URL when using MCP.
- The **MCP** is for Cursor/agent actions (e.g. post messages, read channels). The webhook is for **user-invoked** slash commands in Slack.
- Ensure `SLACK_SIGNING_SECRET` is set so every request from Slack is verified.

## Implementation

- **Handler:** `netlify/functions/slack_webhook.js`
- **Route:** Netlify redirect `/slack/webhook` → `/.netlify/functions/slack_webhook` (see `netlify.toml`).
