# Supabase Setup Instructions

## Database Persistence Fix

The Zolos game now supports persistent character appearance and equipment data. To enable this feature, follow these steps:

### 1. Prerequisites

- Supabase project created and configured
- Environment variables set in Vercel:
  - `VITE_SUPABASE_URL`: Your Supabase project URL
  - `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key

### 2. Run the Migration Script

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the contents of `SUPABASE_MIGRATION.sql` from this repository
5. Paste the SQL into the editor
6. Click **Run** to execute the migration

This script will add the following columns to the `characters` table:
- `weapon` (TEXT): Equipped weapon name
- `hat` (TEXT): Equipped hat name
- `glasses` (TEXT): Equipped glasses name
- `body_color` (TEXT): Hex color for body/shirt
- `hair_color` (TEXT): Hex color for hair
- `pants_color` (TEXT): Hex color for pants

### 3. Verify the Migration

After running the migration, verify that the columns were added:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'characters'
ORDER BY ordinal_position;
```

You should see the new appearance columns in the results.

### 4. Environment Variables for Vercel

Add these to your Vercel project settings under Environment Variables:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SOCKET_SERVER_URL=https://your-railway-server-url.up.railway.app
```

### 5. Socket.io Server Deployment (Railway.app)

After the server/ directory is committed to GitHub:

1. Log in to [Railway.app](https://railway.app)
2. Create a **New Project** → **Deploy from GitHub repo**
3. Select the `narapath3/zolos` repository
4. Set the **Root Directory** to: `server`
5. Railway will automatically assign a `PORT` environment variable
6. Once deployed, copy the public Railway URL (e.g., `https://zolos-production.up.railway.app`)
7. Add `VITE_SOCKET_SERVER_URL=https://your-railway-url.up.railway.app` to Vercel
8. Trigger a re-deploy on Vercel to apply the new server URL

### 6. Offline Mode

The game includes a robust offline fallback mode:
- If Supabase is unavailable, the game uses localStorage
- All character stats, equipment, and appearance are saved locally
- When online again, data syncs to Supabase

### Troubleshooting

**PGRST204 Error**: This occurs when the database schema is missing columns. Run the migration script above to fix it.

**Socket.io Connection Error**: Ensure the `VITE_SOCKET_SERVER_URL` environment variable is set correctly in Vercel.

**Appearance Not Persisting**: Clear browser cache and localStorage, then reload the game.
