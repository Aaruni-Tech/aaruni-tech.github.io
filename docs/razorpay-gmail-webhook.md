# Razorpay to Gmail notifications

Use this Apps Script webhook if you want Razorpay payment notifications sent to `tech.aaruni@gmail.com` without building a full backend.

## What it does

- Accepts Razorpay webhook `POST` requests
- Sends Gmail notifications for `payment.captured`, `order.paid`, and `payment.failed`
- Runs as a Google Apps Script web app

## Files

- `docs/razorpay-gmail-webhook.gs`

## Setup

1. Create a new Apps Script project.
2. Paste the contents of `docs/razorpay-gmail-webhook.gs` into the script editor.
3. In Apps Script, open `Project Settings` and add a script property:
   - Name: `WEBHOOK_TOKEN`
   - Value: any long random string you choose
4. Deploy the script as a web app.
5. Set Razorpay webhook URL to:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?token=YOUR_WEBHOOK_TOKEN
```

6. Subscribe to these events in Razorpay:
   - `payment.captured`
   - `order.paid`
   - `payment.failed`

## Notes

- This is a lightweight notification path for GitHub Pages.
- If you later want strict Razorpay signature validation, move the receiver to a serverless backend that can read the webhook signature header.
- Razorpay webhook docs: `payment.captured`, `order.paid`, and webhook validation are documented in the official Razorpay webhook guides.
