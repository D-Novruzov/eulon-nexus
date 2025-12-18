# Railway Environment Variables Setup

## Your Railway URLs

**Frontend URL:** `https://steadfast-inspiration-production-4f85.up.railway.app`

**Backend URL:** `https://your-backend-service.up.railway.app` (replace with your actual backend URL)

## Frontend Service Configuration

In your Railway **frontend service**, set this environment variable:

```
VITE_API_BASE_URL=https://your-backend-service.up.railway.app
```

⚠️ **Important:** Replace `your-backend-service` with your actual backend Railway service URL.

## Backend Service Configuration

In your Railway **backend service**, set these environment variables:

```
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=https://your-backend-service.up.railway.app/auth/github/callback
FRONTEND_ORIGIN=https://steadfast-inspiration-production-4f85.up.railway.app
PORT=4000
```

⚠️ **Important:** 
- Replace `your-backend-service` with your actual backend Railway service URL
- The `FRONTEND_ORIGIN` should match your frontend URL exactly (including `https://`)

## GitHub OAuth App Configuration

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Edit your OAuth App
3. Update:
   - **Homepage URL**: `https://steadfast-inspiration-production-4f85.up.railway.app`
   - **Authorization callback URL**: `https://your-backend-service.up.railway.app/auth/github/callback`

## Quick Checklist

- [ ] Frontend service has `VITE_API_BASE_URL` set to backend URL
- [ ] Backend service has `FRONTEND_ORIGIN` set to `https://steadfast-inspiration-production-4f85.up.railway.app`
- [ ] Backend service has `GITHUB_CALLBACK_URL` set to backend URL + `/auth/github/callback`
- [ ] GitHub OAuth App has correct callback URL
- [ ] Both services are deployed and running

## After Configuration

1. **Redeploy both services** after setting environment variables
2. **Test the frontend** - it should connect to the backend
3. **Test GitHub OAuth** - click "Connect GitHub" and verify it works

