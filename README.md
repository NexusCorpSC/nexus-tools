# Development

## Setup

- Pull mongo image through podman

```bash
podman pull docker.io/library/mongo
```

- Start a mongodb database

```bash
podman run --name mongo -d -p 27017:27017 mongo
```

### Environment variables

Create a `.env.local` file and add the environment variables.

```bash
touch .env.local
```

```
BETTER_AUTH_SECRET="" # openssl rand -base64 32
MONGODB_URI="mongodb://localhost:27017" # MongoDB connection string
RESEND_API_KEY="CONSOLE" # Display signin OTP in console. Replace by Resend API Key to send real emails.
BLOB_READ_WRITE_TOKEN="" # Blob read/write token for vercel storage
DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
```

## Run

- Start dev server

```bash
npm run dev
```

## Build & Commits

Build the app with:

```bash
npm run build
```

> Dev server doesn't run full analysis and type cheking. Run build to detect build issues.
