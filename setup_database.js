import pg from 'pg';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const sqlFile = path.resolve('admin_rpc_functions.sql');
if (!fs.existsSync(sqlFile)) {
    console.error(`❌ SQL file not found: ${sqlFile}`);
    process.exit(1);
}
const sqlContent = fs.readFileSync(sqlFile, 'utf8');

console.log('============================================');
console.log('⚡ Zolos Supabase Database Setup Utility ⚡');
console.log('This script will create the admin RPC functions in your database.');
console.log('============================================\n');

rl.question('🔑 Enter your Supabase Database Password (or full connection string): ', async (answer) => {
    rl.close();

    let connectionString = answer.trim();
    if (!connectionString) {
        console.error('❌ Database password or connection string cannot be empty.');
        process.exit(1);
    }

    if (!connectionString.startsWith('postgres://') && !connectionString.startsWith('postgresql://')) {
        // Assume it is a password, construct direct connection string
        const projectRef = 'hxvxifghgqwgjbcliqjx';
        connectionString = `postgres://postgres:${encodeURIComponent(connectionString)}@db.${projectRef}.supabase.co:6543/postgres`;
    }

    console.log('\nConnecting to Supabase Database...');
    const client = new pg.Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected successfully.');
        console.log('Running SQL commands to create admin functions...\n');

        await client.query(sqlContent);

        console.log('============================================');
        console.log('🎉 SUCCESS! The following functions are installed:');
        console.log('  1. admin_delete_character(target_char_id)');
        console.log('  2. admin_update_character(target_char_id, updates)');
        console.log('The Admin Dashboard should now function correctly!');
        console.log('============================================');
    } catch (err) {
        console.error('\n❌ Failed to run SQL:', err.message);
        console.log('\n💡 Tip: Make sure your password is correct, and that your database is active.');
    } finally {
        await client.end();
    }
});
