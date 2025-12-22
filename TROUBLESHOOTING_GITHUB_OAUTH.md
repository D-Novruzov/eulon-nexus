# GitHub OAuth Troubleshooting Guide

## Your Current URLs

Based on your setup:

- **Frontend URL**: `https://steadfast-inspiration-production-4f85.up.railway.app`
- **Backend URL**: `https://blissful-radiance-production-9bd0.up.railway.app`
- **Backend Callback URL**: `https://blissful-radiance-production-9bd0.up.railway.app/auth/github/callback`

## Common Issues and Solutions

### Issue 1: "Cannot connect to backend" or 401 Errors

**Symptoms:**

- Console shows: `Failed to load resource: the server responded with a status of 401 (Unauthorized)`
- Frontend is trying to connect to `http://localhost:4000` instead of your backend URL

**Solution:**

1. Go to your **Frontend** Railway service
2. Navigate to **Variables** tab
3. Add/Update this environment variable:
   ```
   VITE_API_BASE_URL=https://blissful-radiance-production-9bd0.up.railway.app
   ```
4. **Redeploy** the frontend service (Railway will auto-redeploy when you save variables, but you may need to trigger a manual redeploy)

### Issue 2: "GitHub OAuth not configured" Error

**Symptoms:**

- Backend returns 500 error with message "GitHub OAuth not configured"
- OAuth flow doesn't start

**Solution:**

1. Go to your **Backend** Railway service
2. Navigate to **Variables** tab
3. Verify these environment variables are set:
   ```
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   GITHUB_CALLBACK_URL=https://blissful-radiance-production-9bd0.up.railway.app/auth/github/callback
   FRONTEND_ORIGIN=https://steadfast-inspiration-production-4f85.up.railway.app
   PORT=4000
   SESSION_SECRET=your_random_session_secret
   ```
4. **Redeploy** the backend service

### Issue 3: GitHub Shows 404 Error

**Symptoms:**

- After clicking "Sign in with GitHub", GitHub shows a 404 page
- OAuth callback URL doesn't match

**Solution:**

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click on your OAuth App
3. Verify the **Authorization callback URL** is exactly:
   ```
   https://blissful-radiance-production-9bd0.up.railway.app/auth/github/callback
   ```
4. **Important**: The callback URL must match EXACTLY (including https://, no trailing slash)
5. Save the changes

### Issue 4: Redirect Doesn't Happen

**Symptoms:**

- Clicking "Sign in with GitHub" doesn't redirect to GitHub
- Console shows errors about CORS or network issues

**Possible Causes:**

1. **Frontend API_BASE_URL not set** - See Issue 1
2. **CORS misconfiguration** - Backend `FRONTEND_ORIGIN` doesn't match frontend URL
3. **Backend not accessible** - Check if backend is running and accessible

**Solution:**

1. Check browser console for specific error messages
2. Verify `VITE_API_BASE_URL` in frontend (see Issue 1)
3. Verify `FRONTEND_ORIGIN` in backend matches your frontend URL exactly:
   ```
   FRONTEND_ORIGIN=https://steadfast-inspiration-production-4f85.up.railway.app
   ```
4. Test backend health endpoint:
   ```
   https://blissful-radiance-production-9bd0.up.railway.app/health
   ```
   Should return JSON with `status: "ok"` and `githubOAuthConfigured: true`

## Diagnostic Steps

### Step 1: Check Backend Configuration

Visit this URL in your browser:

```
https://blissful-radiance-production-9bd0.up.railway.app/debug/config
```

This will show you:

- Whether GitHub OAuth credentials are set
- CORS configuration
- Session configuration
- Whether the frontend origin matches

### Step 2: Check Backend Health

Visit:

```
https://blissful-radiance-production-9bd0.up.railway.app/health
```

Should show:

```json
{
  "status": "ok",
  "githubOAuthConfigured": true,
  "hasClientId": true,
  "hasClientSecret": true,
  "callbackUrl": "https://blissful-radiance-production-9bd0.up.railway.app/auth/github/callback",
  "frontendOrigin": "https://steadfast-inspiration-production-4f85.up.railway.app"
}
```

### Step 3: Check Frontend Configuration

1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for log messages when clicking "Sign in with GitHub"
4. Check the `apiBaseUrl` value - it should be your backend URL, NOT `http://localhost:4000`

### Step 4: Test OAuth Flow Manually

1. Open browser DevTools → Network tab
2. Click "Sign in with GitHub"
3. Check the request to `/auth/github`:
   - **Request URL**: Should be `https://blissful-radiance-production-9bd0.up.railway.app/auth/github`
   - **Response**: Should contain `authorizeUrl` with a GitHub URL
4. If you see the `authorizeUrl`, the redirect should happen automatically

## Complete Configuration Checklist

### Frontend Service (Railway)

- [ ] `VITE_API_BASE_URL` = `https://blissful-radiance-production-9bd0.up.railway.app`

### Backend Service (Railway)

- [ ] `GITHUB_CLIENT_ID` = (your GitHub Client ID)
- [ ] `GITHUB_CLIENT_SECRET` = (your GitHub Client Secret)
- [ ] `GITHUB_CALLBACK_URL` = `https://blissful-radiance-production-9bd0.up.railway.app/auth/github/callback`
- [ ] `FRONTEND_ORIGIN` = `https://steadfast-inspiration-production-4f85.up.railway.app`
- [ ] `PORT` = `4000`
- [ ] `SESSION_SECRET` = (random secure string)

### GitHub OAuth App

- [ ] **Homepage URL**: `https://steadfast-inspiration-production-4f85.up.railway.app`
- [ ] **Authorization callback URL**: `https://blissful-radiance-production-9bd0.up.railway.app/auth/github/callback`

## After Making Changes

1. **Redeploy both services** in Railway (variables trigger auto-redeploy, but verify)
2. **Clear browser cookies** for your Railway domain (or use incognito mode)
3. **Test the flow** from scratch
4. **Check browser console** for any errors

## Still Having Issues?

1. Check Railway logs for both frontend and backend services
2. Use the `/debug/config` endpoint to verify configuration
3. Check browser Network tab to see actual requests being made
4. Verify all URLs match exactly (no typos, correct https://, no trailing slashes)
