# GitHub OAuth Callback URL Explanation

## Important: Callback URL Points to Backend, Not Frontend

The GitHub OAuth callback URL must point to your **backend service**, not your frontend service.

## Your Current URLs

**Frontend URL:** `https://steadfast-inspiration-production-4f85.up.railway.app`

**Backend URL:** `https://your-backend-service.up.railway.app` (you need to get this from Railway)

## Callback URL Format

The callback URL should be:
```
https://your-backend-service.up.railway.app/auth/github/callback
```

## How It Works

1. User clicks "Connect GitHub" on your **frontend** (`steadfast-inspiration-production-4f85.up.railway.app`)
2. Frontend sends request to **backend** to start OAuth flow
3. Backend redirects user to GitHub for authorization
4. GitHub redirects back to **backend** callback URL (`/auth/github/callback`)
5. Backend processes the OAuth response and redirects user back to **frontend**

## Example Configuration

If your backend URL is: `https://my-backend-1234.up.railway.app`

Then your callback URL should be:
```
https://my-backend-1234.up.railway.app/auth/github/callback
```

## Where to Set This

1. **GitHub OAuth App Settings:**
   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Edit your OAuth App
   - Set **Authorization callback URL** to: `https://your-backend-service.up.railway.app/auth/github/callback`

2. **Backend Environment Variable:**
   - In Railway backend service, set:
   ```
   GITHUB_CALLBACK_URL=https://your-backend-service.up.railway.app/auth/github/callback
   ```

3. **Frontend Environment Variable:**
   - In Railway frontend service, set:
   ```
   VITE_API_BASE_URL=https://your-backend-service.up.railway.app
   ```

## Quick Reference

| Service | URL Type | Example |
|---------|----------|---------|
| Frontend | User-facing | `https://steadfast-inspiration-production-4f85.up.railway.app` |
| Backend | API endpoint | `https://your-backend.up.railway.app` |
| Callback | Backend endpoint | `https://your-backend.up.railway.app/auth/github/callback` |

## Finding Your Backend URL

1. Go to your Railway dashboard
2. Open your **backend service**
3. Go to the **Settings** tab
4. Look for **Public Domain** or **Deployments** tab
5. Copy the URL (it will look like `https://something.up.railway.app`)
6. Use that URL + `/auth/github/callback` for the callback URL

