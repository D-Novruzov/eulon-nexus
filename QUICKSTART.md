# Quick Start Guide

## Running the App Locally

The app is now split into **frontend** and **backend** services. You need to run both to use the full application.

### Option 1: Run Both Services (Recommended)

**Terminal 1 - Frontend:**
```bash
# Install dependencies (first time only)
npm install

# Start the frontend dev server
npm run dev
```
Frontend will be available at: **http://localhost:5173**

**Terminal 2 - Backend:**
```bash
# Install backend dependencies (first time only)
cd backend
npm install

# Start the backend server
npm run dev
```
Backend will be available at: **http://localhost:4000**

### Option 2: Use Root Scripts

**Terminal 1 - Frontend:**
```bash
npm run dev
```

**Terminal 2 - Backend:**
```bash
npm run server
```
(This runs `cd backend && npm run dev` for you)

## Environment Variables (Backend)

The backend needs GitHub OAuth credentials for the GitHub integration to work.

### Quick Setup

1. **Create a `.env` file** in the `backend` folder:
   ```bash
   cd backend
   # On Windows PowerShell, you can create it manually or use:
   New-Item .env
   ```

2. **Add your GitHub OAuth credentials** to `backend/.env`:
   ```env
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   GITHUB_CALLBACK_URL=http://localhost:4000/auth/github/callback
   FRONTEND_ORIGIN=http://localhost:5173
   PORT=4000
   ```

3. **Get GitHub OAuth credentials:**
   - See **[backend/GITHUB_OAUTH_SETUP.md](backend/GITHUB_OAUTH_SETUP.md)** for detailed instructions
   - Quick version: Go to [GitHub Developer Settings](https://github.com/settings/developers) → New OAuth App
   - Set callback URL to: `http://localhost:4000/auth/github/callback`

**Note:** The backend will start without these, but you'll see "GitHub OAuth not configured" errors when trying to connect GitHub.

## Building for Production

**Frontend:**
```bash
npm run build
npm start  # Preview the production build
```

**Backend:**
```bash
cd backend
npm start
```

## Troubleshooting

- **Port already in use?** Change `PORT` in backend `.env` or use `npm run dev -- --port 3000` for frontend
- **Backend dependencies missing?** Run `cd backend && npm install`
- **TypeScript errors?** Make sure you've installed all dependencies in both root and backend folders

