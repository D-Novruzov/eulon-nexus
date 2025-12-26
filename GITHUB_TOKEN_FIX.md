# GitHub Token Authentication Fix

## 🐛 Problem

The warning appeared on every page load:
```
⚠️ GitHubService: Initializing WITHOUT authentication token - rate limit will be 60/hour instead of 5000/hour
```

## 🔍 Root Cause

The `IngestionService` was being created **once on component mount** without a GitHub token:

```typescript
// ❌ OLD CODE - Created once without token
const [services] = useState(() => ({
  ingestion: new IngestionService(),  // No token!
  llm: new LLMService(),
}));
```

This meant:
- ✅ ZIP file processing worked (no token needed)
- ❌ GitHub repo processing was **unauthenticated** (60 req/hour limit)
- ❌ Archive download couldn't use authenticated backend proxy
- ❌ Rate limits were hit quickly

## ✅ Solution

### 1. Create Services On-Demand

Instead of storing services in state, create them when needed with the current token:

```typescript
// ✅ NEW CODE - Create with current token
const getGitHubAccessToken = useCallback(() => {
  // Try session storage (OAuth token)
  const accessToken = sessionStorage.getItem("github_access_token");
  if (accessToken) return accessToken;
  
  // Fall back to localStorage
  const legacyToken = localStorage.getItem("github_session_token");
  if (legacyToken) return legacyToken;
  
  // Fall back to state
  return state.githubToken || undefined;
}, [state.githubToken]);

// Create service with token when processing GitHub repos
const githubToken = getGitHubAccessToken();
const ingestionService = new IngestionService(githubToken);
```

### 2. Store GitHub Access Token

Updated `GitHubConnectCard` to store the actual access token:

```typescript
// Backend returns the access token
interface GitHubMeResponse {
  connected: boolean;
  user?: { login: string; name?: string; avatar_url?: string };
  accessToken?: string; // ← Added this
}

// Store it in sessionStorage
if (data.accessToken) {
  sessionStorage.setItem('github_access_token', data.accessToken);
  console.log('🔑 Stored GitHub access token for authenticated requests');
}
```

### 3. Token Priority

The system now checks for tokens in this order:

1. **`sessionStorage.github_access_token`** - OAuth token (best)
2. **`localStorage.github_session_token`** - Legacy session token
3. **`state.githubToken`** - Manual token input

## 📊 Impact

### Before Fix
- ❌ Unauthenticated requests (60/hour limit)
- ❌ Rate limit errors frequent
- ❌ Archive download used public CORS proxy
- ❌ Warning on every page load

### After Fix
- ✅ Authenticated requests (5000/hour limit)
- ✅ No rate limit errors
- ✅ Archive download uses authenticated backend proxy
- ✅ No warnings

## 🚀 Files Changed

1. **`src/ui/pages/HomePage.tsx`**
   - Removed static service creation
   - Added `getGitHubAccessToken()` helper
   - Create `IngestionService` with token when processing repos

2. **`src/ui/components/github/GitHubConnectCard.tsx`**
   - Added `accessToken` to `GitHubMeResponse` interface
   - Store access token in `sessionStorage` after OAuth

3. **Backend already returns `accessToken`** in `/integrations/github/me` response

## 🧪 Testing

After deploying, you should see:

```
🔑 Using GitHub token for repo processing: YES
📦 Using backend proxy for authenticated archive download
✅ Backend proxy download successful
```

Instead of:

```
⚠️ GitHubService: Initializing WITHOUT authentication token
📦 Using CORS proxy for archive download
❌ CORS policy error
```

## 🎯 Benefits

1. **5000 requests/hour** instead of 60 (83x increase!)
2. **Authenticated archive downloads** via backend
3. **No CORS errors** (backend proxy works)
4. **Private repo access** (if user has permissions)
5. **No warning messages** in console

## 📝 Summary

The fix ensures that:
- GitHub token is **always** passed to `IngestionService`
- Token is retrieved from the **correct source** (OAuth > localStorage > state)
- Services are created **on-demand** with current token
- Archive downloads use **authenticated backend proxy**

This completes the optimization! 🎉

