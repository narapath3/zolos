# Vercel Environment Variables Setup

This guide explains how to configure environment variables in Vercel for the Zolos game.

## Required Environment Variables

### 1. Socket.io Server URL

**Variable Name**: `VITE_SOCKET_URL`

**Value**: Your Railway server URL (e.g., `https://zolos-socket-server.railway.app`)

**Purpose**: Tells the frontend where to connect for real-time multiplayer features

**Example**:
```
VITE_SOCKET_URL=https://zolos-socket-server.railway.app
```

### 2. Supabase Configuration

These are already configured in your Supabase project, but you may need them in Vercel:

**Variable Name**: `VITE_SUPABASE_URL`

**Value**: Your Supabase project URL

**Example**:
```
VITE_SUPABASE_URL=https://hxvxifghgqwgjbcliqjx.supabase.co
```

---

**Variable Name**: `VITE_SUPABASE_ANON_KEY`

**Value**: Your Supabase anonymous key

**Example**:
```
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## How to Add Environment Variables in Vercel

### Method 1: Via Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your **Zolos** project
3. Click **Settings** in the top navigation
4. Click **Environment Variables** in the left sidebar
5. Click **Add New** button
6. Enter:
   - **Name**: `VITE_SOCKET_URL`
   - **Value**: `https://zolos-socket-server.railway.app` (replace with your actual URL)
   - **Environments**: Select `Production`, `Preview`, and `Development`
7. Click **Save**
8. Repeat for other variables as needed

### Method 2: Via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Link to your project
vercel link

# Add environment variable
vercel env add VITE_SOCKET_URL

# When prompted, enter the value:
# https://zolos-socket-server.railway.app

# Pull environment variables locally
vercel env pull

# Redeploy
vercel deploy --prod
```

## Environment Variables by Deployment Stage

### Production
- `VITE_SOCKET_URL`: Your Railway production server
- `VITE_SUPABASE_URL`: Production Supabase URL
- `VITE_SUPABASE_ANON_KEY`: Production Supabase key

### Preview (Staging)
- `VITE_SOCKET_URL`: Can point to staging server or production
- `VITE_SUPABASE_URL`: Can point to staging or production database
- `VITE_SUPABASE_ANON_KEY`: Corresponding key

### Development (Local)
- Create a `.env.local` file in the project root:
```
VITE_SOCKET_URL=http://localhost:3000
VITE_SUPABASE_URL=https://hxvxifghgqwgjbcliqjx.supabase.co
VITE_SUPABASE_ANON_KEY=your-key-here
```

## Accessing Environment Variables in Code

In the Zolos frontend code, environment variables are accessed via `import.meta.env`:

```javascript
// src/network/GameSync.js
const socketServerUrl = import.meta.env.VITE_SOCKET_URL;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Connect to Socket.io server
const socket = io(socketServerUrl, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});
```

## Verifying Environment Variables

After deploying with new environment variables:

1. Open your Zolos game
2. Open browser DevTools (F12)
3. Go to **Console** tab
4. Type: `import.meta.env.VITE_SOCKET_URL`
5. You should see your Railway server URL

## Troubleshooting

### Variables Not Appearing in Build

**Problem**: Environment variables show as `undefined` in the browser

**Solution**:
1. Ensure variable names start with `VITE_` (Vite requirement)
2. Redeploy after adding variables
3. Clear browser cache (Ctrl+Shift+Delete)
4. Check Vercel build logs for errors

### Build Fails After Adding Variables

**Problem**: Deployment fails with "Cannot find variable" errors

**Solution**:
1. Check that variable names are spelled correctly
2. Ensure values don't contain quotes or special characters
3. Verify the variable is added to all required environments
4. Check build logs in Vercel dashboard

### Socket.io Connection Still Fails

**Problem**: Game still can't connect to Socket.io server

**Solution**:
1. Verify the Railway server URL is correct and accessible
2. Check CORS settings in `server/index.js`
3. Ensure `VITE_SOCKET_URL` matches the Railway domain exactly
4. Check browser console for specific error messages

## Security Best Practices

1. **Never commit `.env` files** to GitHub
2. **Use Vercel's environment variables** for sensitive data
3. **Rotate keys regularly** if compromised
4. **Use different keys** for production and staging
5. **Restrict Supabase keys** with Row Level Security (RLS)

## Environment Variable Reference

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `VITE_SOCKET_URL` | Yes | `https://zolos-socket-server.railway.app` | Must be HTTPS in production |
| `VITE_SUPABASE_URL` | Yes | `https://hxvxifghgqwgjbcliqjx.supabase.co` | From Supabase dashboard |
| `VITE_SUPABASE_ANON_KEY` | Yes | `eyJhbGc...` | From Supabase dashboard |

---

**Last Updated**: July 12, 2026
**Vercel CLI Version**: 33.0.0+
