// PM2 process config for the Zolos realtime Map Server (ReadyIDC VPS).
//
// Secrets are NOT stored here — server.js reads process.env, and we load them
// from server/.env (git-ignored) via node's --env-file flag. Keep .env on the
// VPS only. Start/stop with:
//   pm2 start  /opt/zolos/deploy/ecosystem.config.cjs
//   pm2 restart zolos-server
//   pm2 logs   zolos-server
module.exports = {
  apps: [
    {
      name: 'zolos-server',
      cwd: '/opt/zolos/server',
      script: 'server.js',
      // Socket.io keeps player presence in-memory and is single-process here;
      // running multiple instances would need sticky sessions + a Redis
      // adapter, which we don't need at this scale. One fork = one core.
      instances: 1,
      exec_mode: 'fork',
      node_args: '--env-file=.env',
      autorestart: true,
      max_restarts: 15,
      // Restart if it leaks past ~1.2 GB (safe headroom on a 2 GB box).
      max_memory_restart: '1200M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
