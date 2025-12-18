## GitNexus Backend (GitHub Integration API)

This folder contains the Express-based backend used for GitHub OAuth and repository metadata.

### Local development

From the repo root:

```bash
cd backend
npm install
npm run dev
```

The server listens on port `4000` by default.

Required environment variables:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL` (e.g. `https://your-backend-url/auth/github/callback`)
- `FRONTEND_ORIGIN` (e.g. `https://your-frontend-url`)

### Railway deployment

Create a Railway **service** pointing at this `backend` folder as the root directory.

- **Install command**: `npm install`
- **Start command**: `npm start`
- **Port**: `4000`

Set the env vars above in the Railway service settings.


