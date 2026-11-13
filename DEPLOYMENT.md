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

With `NEXT_PUBLIC_HOUSEHOLD_API_URL` empty, the calculator sends each household to
www.policyengine.org's dashboard API (`@policyengine/api-client`) instead of the Modal
backend; it needs no credential. That API answers pages on `http://localhost` and
`http://127.0.0.1` only, so open the dev server there rather than on its network address.
It allows 30 household calculations a minute per IP address, and each calculation here
sends two (current law and the reform).
