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

## Run

- Add `MONGODB_URI` variable

```bash
echo "MONGODB_URI=mongodb://localhost:27017" >> .env
```

- Add `RESEND_API_KEY` env variable, you can get a free api key on the [resend website](https://resend.com/onboarding)

```bash
echo "RESEND_API_KEY=re_xxxxxxx" >> .env
```

- Start dev server

```bash
npm run dev
```