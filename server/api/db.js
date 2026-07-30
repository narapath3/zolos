// Local Postgres connection pool for the self-hosted API.
import pg from 'pg';

const pool = new pg.Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER || 'zolos_app',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'zolos',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
});

pool.on('error', (err) => console.error('[api/db] pool error:', err.message));

export function query(text, params) {
    return pool.query(text, params);
}

// Run fn inside a transaction; auto rollback on throw.
export async function tx(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        throw e;
    } finally {
        client.release();
    }
}

export { pool };
