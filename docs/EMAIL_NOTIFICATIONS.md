# Email Notifications Setup for BharatVerify

This guide walks through configuring outbound emails for issuance, verification, adapter failures, and revocations. The backend supports Gmail SMTP via App Passwords as the default transport and can fall back to SendGrid, Mailgun, or AWS SES behind the same interface.

## Prerequisites
- Active Gmail account with 2-Step Verification enabled
- Generated 16 character Gmail App Password for "Mail" apps
- Access to BharatVerify backend environment variables (.env)

## Step 1: Generate a Gmail App Password
1. Visit https://myaccount.google.com/
2. Security ? 2-Step Verification ? App passwords
3. Choose **App: Mail** and **Device: Other (Custom)** (e.g., "BharatVerify")
4. Copy the 16 character password (no spaces)

## Step 2: Configure Environment Variables
1. Copy `.env.example` to `.env`
2. Set the Gmail SMTP credentials and admin recipients:

```
EMAIL_TRANSPORT=gmail
EMAIL_HOST_USER=your_email@gmail.com
EMAIL_HOST_PASSWORD=xxxxxxxxxxxxxxxx
ADMIN_EMAIL=admin@yourinstitution.com
ISSUER_NOTIF_EMAIL=notifications@yourcollege.edu  # optional
STUDENT_NOTIF_ENABLED=false
APP_NAME=BharatVerify
APP_BASE_URL=http://localhost:8000
```

## Step 3: Test the Notification Pipeline
A dev-only endpoint is exposed while `NODE_ENV !== 'production'`:

```
POST /api/dev/notify/test
Authorization: Bearer <admin JWT>
{
  "to": "admin@yourinstitution.com",
  "subject": "Test � BharatVerify Email",
  "text": "Hello from BharatVerify email test."
}
```

Example cURL commands:

```bash
# Simulate a verification failure email to admin
curl -X POST "$API_BASE/api/dev/notify/test" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "'"$ADMIN_EMAIL"'",
    "subject": "Test � BharatVerify Email",
    "text": "Hello from BharatVerify email test."
  }'

# Trigger a real issuance flow
curl -X POST "$API_BASE/api/admin/issue" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -F ownerId=1 \
  -F title="B.Tech Degree" \
  -F docId="CERT-2025-0001" \
  -F pdf=@sample.pdf

# Trigger a verification flow (file upload)
curl -X POST "$API_BASE/api/verifications/verify" \
  -H "Authorization: Bearer $COMPANY_TOKEN" \
  -F docId="CERT-2025-0001" \
  -F pdf=@sample.pdf
```

## How It Works
- `notifyIssueSuccess` runs after a certificate is anchored and emails the issuer/admin with docId, issued time, SHA-256, and transaction hash.
- `notifyVerificationResult` runs on every verification, emailing issuer/admin (and optionally the student) with the verdict, hash comparison, and issuer signature status.
- `notifyAdminVerificationFailed` triggers for hash mismatches, signature errors, or adapter outages to alert `ADMIN_EMAIL`.
- `notifyRevoked` is called when a certificate is revoked and notifies the issuer/admin plus the student when enabled.

All notifications share a common transport interface (`sendEmail`) which chooses Gmail SMTP or a configured provider. Delivery errors are logged (`EMAIL_SEND_FAILED`) but never block the API response.

## Automatic Notifications
- **Issuance success** ? issuer/admin summary with explorer link
- **Verification pass/fail/revoked** ? issuer/admin, optional student copy
- **Adapter or verification failure** ? admin alert with expected vs actual hashes
- **Revocation** ? issuer/admin and optional student details

## Email Content Snapshot
Each template supplies both plain text and simple HTML:
- Document metadata (title, docId, issued/revoked timestamps)
- Short SHA-256 digest and blockchain transaction hash
- Verification verdict, hash match flag, issuer signature status
- Expected vs actual hashes for failures
- Explorer URL for quick inspection

## Troubleshooting
- `Email not configured` log on boot ? verify `.env` variables and selected transport
- `Authentication failed` ? regenerate Gmail App Password or update provider credentials
- `Connection refused` ? check local firewalls or outbound SMTP policies
- No email received ? use `/api/dev/notify/test` to confirm transport, then inspect logs for `EMAIL_SEND_FAILED`

## Security Notes
- Never commit `.env` files or credentials to source control
- Use provider-specific app passwords or API keys and rotate them periodically
- Monitor logs for delivery failures to catch expiring credentials early

## Customization Ideas
- Edit templates in `src/notifications/email/email_templates.ts`
- Add CC/BCC logic inside `email_service.ts`
- Route student copies conditionally (e.g., only on failure)
- Extend transports to support additional providers or queues if needed
