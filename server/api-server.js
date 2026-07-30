// Standalone test entry for the self-hosted API (Phase 1).
// Runs on API_PORT (default 3002), separate from the live game server, so we
// can build/test against local Postgres without touching production.
import express from 'express';
import cors from 'cors';
import { createApiRouter } from './api/index.js';

const app = express();
app.use(cors());
app.use('/api', createApiRouter());

const PORT = parseInt(process.env.API_PORT) || 3002;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`[api-server] self-host API listening on http://127.0.0.1:${PORT}/api`);
});
