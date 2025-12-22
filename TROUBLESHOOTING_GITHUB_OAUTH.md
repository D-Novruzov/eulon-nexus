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

### Issue 5: Cookie Not Being Sent (Session Lost After Redirect) ⚠️ **YOUR CURRENT ISSUE**

**Symptoms:**

- OAuth callback succeeds and session is saved (logs show "Session saved successfully")
- But frontend requests show "cookie: 'missing'" in logs
- Different session IDs on callback vs. frontend requests
- 401 errors when checking GitHub connection status
- No redirect happens after OAuth callback

**Root Cause:**
This is a cross-origin cookie issue. The cookie is set on the backend domain during OAuth callback, but the browser isn't sending it back when the frontend (different domain) makes requests.

**Solution:**

1. **CRITICAL: Verify SESSION_SECRET is Set:**

   - This is the most common cause - if `SESSION_SECRET` is not set or changes between deployments, cookies won't work
   - Set it to a **fixed, random string** (at least 32 characters)
   - It must **NOT change** between deployments
   - Generate with: `openssl rand -hex 32` or use an online generator
   - In Railway backend variables, set:
     ```
     SESSION_SECRET=your_fixed_random_string_here_at_least_32_chars
     ```

2. **Verify Cookie Settings:**

   - Backend automatically sets:
     - `secure: true` (requires HTTPS) ✓
     - `sameSite: "none"` (required for cross-origin) ✓
   - These are set automatically in production

3. **Check Browser Cookie Settings:**

   - Some browsers block third-party cookies by default
   - Chrome: Settings → Privacy and security → Third-party cookies → Allow all cookies (for testing)
   - Safari: May block cross-site cookies by default
   - Try in an incognito/private window to test
   - Check browser DevTools → Application → Cookies to see if cookies are stored

4. **Test Cookie Setting:**
   Visit this URL to test if cookies work:

   ```
   https://blissful-radiance-production-9bd0.up.railway.app/debug/test-cookie
   ```

   Then check if the cookie is sent in subsequent requests to `/debug/config`

5. **Check Railway Logs:**
   Look for these log messages:

   - "Session saved successfully" - confirms cookie was set
   - "Cookie being set before redirect" - shows cookie header
   - "cookie: 'missing'" - indicates cookie not received

6. **After Fixing SESSION_SECRET:**
   - Redeploy the backend service
   - Clear all browser cookies for railway.app domain
   - Try the OAuth flow again from scratch

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
- Cookie information

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
- [ ] **`SESSION_SECRET`** = (fixed random string, at least 32 chars) ⚠️ **MOST IMPORTANT**

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
2. Use the `/debug/config` endpoint to verify configuration:
   ```
   https://blissful-radiance-production-9bd0.up.railway.app/debug/config
   ```
3. Use the `/debug/test-cookie` endpoint to test cookie functionality
4. Check browser Network tab to see actual requests being made
5. Check browser DevTools → Application → Cookies to see if cookies are stored
6. Verify all URLs match exactly (no typos, correct https://, no trailing slashes)
7. **Most Important**: Verify `SESSION_SECRET` is set to a fixed value and doesn't change
