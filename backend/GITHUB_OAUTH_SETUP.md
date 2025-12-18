# GitHub OAuth Setup Guide

To enable GitHub integration, you need to create a GitHub OAuth App and configure the credentials.

## Step 1: Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"** (or **"Register a new application"**)
3. Fill in the application details:
   - **Application name**: `GitNexus` (or any name you prefer)
   - **Homepage URL**: `http://localhost:5173` (for local dev) or your production frontend URL
   - **Authorization callback URL**: 
     - **Local**: `http://localhost:4000/auth/github/callback`
     - **Production**: `https://your-backend-domain.railway.app/auth/github/callback`
4. Click **"Register application"**

## Step 2: Get Your Credentials

After creating the app, you'll see:
- **Client ID** - Copy this
- **Client Secret** - Click "Generate a new client secret" and copy it

## Step 3: Configure Environment Variables

### For Local Development

1. Copy the example environment file:
   ```bash
   cd backend
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```env
   GITHUB_CLIENT_ID=your_actual_client_id
   GITHUB_CLIENT_SECRET=your_actual_client_secret
   GITHUB_CALLBACK_URL=http://localhost:4000/auth/github/callback
   FRONTEND_ORIGIN=http://localhost:5173
   PORT=4000
   ```

3. Restart your backend server

### For Railway Deployment

1. In your Railway backend service, go to **Variables**
2. Add these environment variables:
   - `GITHUB_CLIENT_ID` = your GitHub Client ID
   - `GITHUB_CLIENT_SECRET` = your GitHub Client Secret
   - `GITHUB_CALLBACK_URL` = `https://your-backend-domain.railway.app/auth/github/callback`
   - `FRONTEND_ORIGIN` = `https://your-frontend-domain.railway.app`
   - `PORT` = `4000` (Railway will set this automatically, but you can override)

3. **Important**: Update your GitHub OAuth App's callback URL to match your Railway backend URL

## Troubleshooting

- **"GitHub OAuth not configured"**: Make sure your `.env` file exists and has the correct values
- **401 Unauthorized**: The OAuth flow hasn't completed - make sure you've authorized the app on GitHub
- **CORS errors**: Check that `FRONTEND_ORIGIN` matches your frontend URL exactly (including `http://` or `https://`)

