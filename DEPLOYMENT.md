# Deployment

## Vercel

Create a Vercel project with the root directory set to `frontend/`.

Set these environment variables in Vercel:

- `NEXT_PUBLIC_HOUSEHOLD_API_URL`
  - Example: `https://aspen-eitc-ctc.modal.run`
- `NEXT_PUBLIC_BASE_PATH`
  - Leave blank for a standalone Vercel app
  - Set to `/us/aspen-eitc-ctc` only if the app is being mounted under that path

Then deploy the `frontend/` app normally with Vercel.

## Modal

Deploy the Modal backend from the repo root:

```bash
modal deploy modal_app.py
```

The backend exposes:

- `GET /health`
- `POST /household-impact`

## Local

Frontend:

```bash
cd frontend
npm run dev
```

Optional local env:

```bash
cp .env.example .env.local
```
