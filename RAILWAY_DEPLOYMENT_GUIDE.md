# Railway.app Deployment Guide for Zolos Socket.io Server

This guide will help you deploy the Socket.io multiplayer server to Railway.app in just a few minutes.

## Prerequisites

- Railway.app account (already set up)
- GitHub account connected to Railway
- The Zolos repository with the `server/` directory

## Step 1: Create a New Railway Project from GitHub

1. Go to [Railway Dashboard](https://railway.com/dashboard)
2. Click **New** button
3. Select **GitHub Repository**
4. Click **Install GitHub App** (if not already installed)
5. Select the `narapath3/zolos` repository
6. Click **Deploy**

## Step 2: Configure the Server Service

Once the repository is imported:

1. In the Railway dashboard, click on your project
2. Click the **New** button and select **Service**
3. Choose **GitHub Repo** and select the `narapath3/zolos` repository again
4. In the service settings:
   - **Name**: `zolos-socket-server`
   - **Root Directory**: `server`
   - **Start Command**: `npm run start`

## Step 3: Set Environment Variables

In the Railway dashboard for the socket server service:

1. Go to **Variables** tab
2. Add the following environment variables:

```
PORT=3000
NODE_ENV=production
SUPABASE_URL=https://hxvxifghgqwgjbcliqjx.supabase.co
SUPABASE_KEY=<your-supabase-anon-key>
CORS_ORIGIN=https://zolos.vercel.app
```

**To get your Supabase keys:**
- Go to [Supabase Dashboard](https://supabase.com/dashboard)
- Select the Zolos project
- Go to **Settings** → **API**
- Copy the **Project URL** and **anon public key**

## Step 4: Deploy

1. Railway will automatically detect the Node.js project in the `server/` directory
2. It will install dependencies and start the server
3. Once deployed, Railway will provide you with a public URL (e.g., `https://zolos-socket-server.railway.app`)

## Step 5: Update Vercel Environment Variables

Once you have the Railway server URL:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the Zolos project
3. Go to **Settings** → **Environment Variables**
4. Add or update:
   ```
   VITE_SOCKET_SERVER_URL=https://zolos-socket-server.railway.app
   ```
5. Redeploy the frontend

## Step 6: Verify Connection

1. Open the Zolos game at https://zolos.vercel.app
2. Open browser DevTools (F12)
3. Check the **Console** tab for Socket.io connection messages
4. You should see: `Socket.io connected to https://zolos-socket-server.railway.app`

## Troubleshooting

### Socket.io Connection Failed

**Error**: `WebSocket connection to 'wss://...' failed`

**Solution**:
1. Check that the CORS_ORIGIN in Railway matches your Vercel domain
2. Verify the VITE_SOCKET_SERVER_URL is correct in Vercel
3. Check Railway logs for errors

### Server Not Starting

**Error**: `Cannot find module 'express'` or similar

**Solution**:
1. Ensure `server/package.json` exists and has all dependencies
2. Check that `server/index.js` is the correct entry point
3. View Railway build logs for detailed error messages

### Environment Variables Not Loading

**Solution**:
1. Redeploy the service after adding environment variables
2. Check that variable names match exactly (case-sensitive)
3. Use Railway's **Redeploy** button to force a fresh deployment

## Server Architecture

The Socket.io server handles:

- **Player Positions**: Real-time position synchronization
- **Chat Messages**: Global and private chat
- **Trades**: P2P trading system
- **Friend Requests**: Friend list management
- **Presence**: Online/offline status

All data is synchronized with Supabase for persistence.

## Performance Monitoring

In Railway dashboard:

1. Go to **Metrics** tab to monitor:
   - CPU usage
   - Memory usage
   - Network I/O
   - Request count

2. Go to **Logs** tab to view:
   - Server startup logs
   - Connection events
   - Error messages

## Scaling

If you need to handle more concurrent players:

1. In Railway, upgrade to a larger instance size
2. Consider adding a Redis cache for session data
3. Monitor metrics and scale as needed

## Cost Estimation

- **Free Tier**: Includes $5 credit/month (sufficient for small deployments)
- **Pro Tier**: Pay-as-you-go ($0.000463/hour per GB-hour)

For a typical idle RPG with 100 concurrent players, expect ~$10-20/month.

## Support

- Railway Docs: https://docs.railway.com
- Zolos GitHub: https://github.com/narapath3/zolos
- Socket.io Docs: https://socket.io/docs/

---

**Last Updated**: July 12, 2026
**Server Version**: 1.0.0
