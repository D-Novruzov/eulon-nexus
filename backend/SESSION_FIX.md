# Session 401 Error Fix

## The Problem

Getting 401 errors after GitHub OAuth authorization. This is usually caused by:

1. **SESSION_SECRET not set** - Sessions are invalidated on every server restart
2. **Session cookie not being sent** - Cookie settings or CORS issues
3. **Session not being saved** - Express-session save callback issues

## Solution

### Step 1: Set SESSION_SECRET in Railway

**CRITICAL:** You must set `SESSION_SECRET` in your Railway backend service environment variables.

1. Go to Railway → Backend Service → Variables
2. Add:
   ```
   SESSION_SECRET=your-random-secret-string-here
   ```
3. Generate a secure random string (you can use: `openssl rand -hex 32` or any random string generator)
4. **Important:** Keep this secret the same - don't change it or all sessions will be invalidated

### Step 2: Verify Session Configuration

The session middleware is now configured with:
- `sameSite: "none"` in production (for cross-site redirects)
- `secure: true` in production (required for HTTPS)
- 30-day expiration

### Step 3: Check Railway Logs

After redeploying, check the backend logs for:
- `[Session] Checking session:` - Shows if session exists
- `[OAuth] Session saved successfully` - Confirms session was saved
- Any warnings about SESSION_SECRET

## Common Issues

### Issue 1: SESSION_SECRET Not Set
**Symptom:** Works for you, but not for others (or stops working after restart)

**Fix:** Set `SESSION_SECRET` environment variable in Railway

### Issue 2: Cookie Not Being Sent
**Symptom:** 401 error immediately after redirect

**Check:**
- Browser console → Application → Cookies
- Look for `eulonai_session` cookie
- Verify it's set on your backend domain
- Check if it has `Secure` and `SameSite=None` flags

### Issue 3: CORS Issues
**Symptom:** Cookie exists but 401 error

**Fix:** Make sure `FRONTEND_ORIGIN` matches your frontend URL exactly (no trailing slash)

## Debugging

The code now includes debug logging. Check Railway backend logs for:

1. **During OAuth callback:**
   ```
   [OAuth] Storing session for user <username>, session ID: <id>
   [OAuth] Session saved successfully for user <username>
   ```

2. **When checking session:**
   ```
   [Session] Checking session: { hasSession: true, hasAccessToken: true, ... }
   ```

If you see `hasAccessToken: false`, the session wasn't saved properly.

## Quick Checklist

- [ ] `SESSION_SECRET` is set in Railway backend environment variables
- [ ] Backend has been redeployed after setting SESSION_SECRET
- [ ] `FRONTEND_ORIGIN` is set correctly (no trailing slash)
- [ ] Check Railway logs for session debug messages
- [ ] Verify cookie exists in browser (Application → Cookies)

