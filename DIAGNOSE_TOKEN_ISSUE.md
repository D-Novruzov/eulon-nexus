# Diagnosing GitHub Token Issue

## Current Problem

You're hitting the **60 requests/hour** rate limit, which confirms the GitHub API calls are **UNAUTHENTICATED**. This means the OAuth token is not being attached to GitHub API requests.

## Why This Happens

The most common reasons:

1. **Token not retrieved from backend** - Frontend fails to fetch the token from the session
2. **Session token expired** - The temporary session token in localStorage expired
3. **Backend session lost** - Railway/production environment lost the session data
4. **CORS/Cookie issues** - Cross-origin requests blocking cookie/session access

## Step-by-Step Diagnosis

### 1. Check Browser Console (Frontend)

Open your browser's Developer Tools → Console when importing a repository. Look for these log messages:

#### ✅ **Expected (Working)**

```
📝 Found session token in localStorage, fetching GitHub access token from backend...
✅ Retrieved GitHub access token from backend session (ghp_12345...)
🔑 GitHubService: Initializing with authentication token (ghp_12345...)
```

#### ❌ **Problem Signs**

```
⚠️ No session token found in localStorage
// OR
❌ Failed to fetch GitHub token from backend: 401 Unauthorized
// OR
⚠️⚠️⚠️ IMPORTANT: No GitHub token available!
// OR
⚠️ GitHubService: Initializing WITHOUT authentication token
```

### 2. Check Backend Logs (Server)

Look in your backend/Railway logs for these messages:

#### ✅ **Expected (Working)**

```
✅ GitHub OAuth: Obtained access token (ghp_12345...)
✅ GitHub OAuth: Fetched user data for <username>
💾 Storing access token and user data in session...
Session saved successfully
...
🔑 Returning GitHub access token: ghp_12345...
```

#### ❌ **Problem Signs**

```
❌ GitHub OAuth: No access token in response
// OR
Session missing GitHub data
// OR
🔑 Returning GitHub access token: MISSING
```

### 3. Check Rate Limit in Console

When you make the first GitHub API call, you should see:

#### ✅ **Authenticated (Good)**

```
📊 GitHub API: 4998/5000 requests remaining (resets in 45 minutes)
```

#### ❌ **Unauthenticated (Bad)**

```
⚠️ GitHub API: Using UNAUTHENTICATED rate limit (58/60). Token may not be attached to requests!
```

## Quick Fix Actions

### Action 1: Re-authenticate with GitHub

1. Clear localStorage: `localStorage.clear()` in browser console
2. Refresh the page
3. Click "Connect GitHub" again
4. Complete OAuth flow
5. Try importing again

### Action 2: Check Session Token in localStorage

In browser console:

```javascript
localStorage.getItem("github_session_token");
```

- **If null**: Re-authenticate (Action 1)
- **If exists**: Token might be expired, try Action 1

### Action 3: Test Backend Token Endpoint

In browser console:

```javascript
const sessionToken = localStorage.getItem("github_session_token");
fetch("http://localhost:4000/integrations/github/me", {
  credentials: "include",
  headers: { "X-Session-Token": sessionToken },
})
  .then((r) => r.json())
  .then((data) => console.log("Backend response:", data))
  .catch((err) => console.error("Error:", err));
```

Expected response:

```json
{
  "connected": true,
  "user": { ... },
  "accessToken": "ghp_..."
}
```

### Action 4: Check Backend Environment Variables

Ensure these are set in Railway/production:

```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=https://your-backend.railway.app/auth/github/callback
FRONTEND_ORIGIN=https://your-frontend.vercel.app
SESSION_SECRET=random_secret_string
```

## Understanding the Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. User clicks "Connect GitHub"                         │
│    → Opens OAuth authorization URL                      │
│    → Redirects to GitHub                                │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 2. User authorizes app on GitHub                        │
│    → GitHub redirects to callback URL with code         │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Backend exchanges code for access token              │
│    → POST to https://github.com/login/oauth/access_token│
│    → Receives: { access_token: "ghp_..." }             │
│    → Stores in session: req.session.githubAccessToken   │
│    → Creates temporary session token                    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Frontend receives session token                      │
│    → Stores in localStorage                             │
│    → Sets: localStorage.setItem('github_session_token')│
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 5. User clicks "Import from GitHub"                     │
│    → Frontend reads: localStorage.getItem('...')        │
│    → Calls: /integrations/github/me with X-Session-Token│
│    → Backend returns: { accessToken: "ghp_..." }       │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Frontend creates IngestionService(githubToken)       │
│    → IngestionService creates GitHubService(token)      │
│    → GitHubService sets: Authorization: Bearer token    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 7. All GitHub API calls include Authorization header    │
│    → Rate limit: 5000/hour (authenticated)              │
│    → Instead of: 60/hour (unauthenticated)              │
└─────────────────────────────────────────────────────────┘
```

## Where the Token Gets Lost (Common Issues)

### Issue 1: Step 4 → Step 5 (Session Token Not Stored)

**Symptom**: No session token in localStorage  
**Fix**: Check if OAuth redirect URL includes `?session_token=...` parameter

### Issue 2: Step 5 (Backend Session Expired)

**Symptom**: `401 Unauthorized` from `/integrations/github/me`  
**Fix**: Re-authenticate, or increase session duration in backend

### Issue 3: Step 5 → Step 6 (Token Not Passed to Service)

**Symptom**: IngestionService logs "WITHOUT authentication token"  
**Fix**: Check if token is undefined/null in useProcessing hook

### Issue 4: Railway Session Storage (Production Only)

**Symptom**: Works locally, fails on Railway  
**Fix**: Ensure session secret is set, or use Redis for session storage

## Why It "Didn't Happen Before"

Possible explanations:

1. **Small Repos Before**: Previous imports used <60 requests, so rate limit wasn't hit
2. **Fresh Token Before**: You authenticated recently, token was still in session
3. **Different Env**: Testing locally (works) vs production Railway (broken)
4. **Code Changed**: Recent changes broke token passing

## Next Steps

1. **Start both servers**:

   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev

   # Terminal 2 - Frontend
   cd ..
   npm run dev
   ```

2. **Open browser console** (F12)

3. **Try importing a small repository** (~20 files)

4. **Look for the diagnostic logs I added**:

   - If you see "WITHOUT authentication token" → Token not retrieved
   - If you see rate limit 60/60 → Token not attached to requests
   - If you see rate limit 5000/5000 → Working correctly! ✅

5. **Share the logs** and I can pinpoint exactly where the token is getting lost

## Testing Script

Run this in browser console after authenticating:

```javascript
// Check localStorage
console.log("Session token:", localStorage.getItem("github_session_token"));

// Test backend endpoint
async function testBackend() {
  const sessionToken = localStorage.getItem("github_session_token");
  const API_BASE_URL = "http://localhost:4000"; // or your Railway URL

  try {
    const response = await fetch(`${API_BASE_URL}/integrations/github/me`, {
      credentials: "include",
      headers: { "X-Session-Token": sessionToken },
    });

    const data = await response.json();
    console.log("Backend response:", data);

    if (data.accessToken) {
      console.log(
        "✅ Token retrieved successfully:",
        data.accessToken.substring(0, 8) + "..."
      );
    } else {
      console.error("❌ No accessToken in response!");
    }
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

testBackend();
```

Expected output:

```
Session token: abc123...
Backend response: {connected: true, user: {...}, accessToken: "ghp_..."}
✅ Token retrieved successfully: ghp_1234...
```
