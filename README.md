# Development

## Setup

- Start a mongodb database

```bash
podman run --name mongo -d -p 27017:27017 mongo
```

### Environment variables

```
BETTER_AUTH_SECRET="" # openssl rand -base64 32
MONGODB_URI="" # MongoDB connection string
RESEND_API_KEY="CONSOLE" # Display signin OTP in console. Replace by Resend API Key to send real emails.
BLOB_READ_WRITE_TOKEN="" # Blob read/write token for vercel storage
DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
```