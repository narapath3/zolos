const fs = require('fs');

function parseEnv(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf8');
    const env = {};
    for (const line of content.split('\n')) {
        const cleanLine = line.trim();
        if (!cleanLine || cleanLine.startsWith('#')) continue;
        const index = cleanLine.indexOf('=');
        if (index === -1) continue;
        const key = cleanLine.substring(0, index).trim();
        let val = cleanLine.substring(index + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
        }
        env[key] = val;
    }
    return env;
}

const localEnv = parseEnv('.env');
const prodEnv = parseEnv('.env.production.local');

console.log('Comparing local working .env with pulled Vercel production variables:');

const keysToCheck = [
    { keyName: 'VITE_SUPABASE_URL', localKey: 'VITE_SUPABASE_URL', prodKey: 'VITE_SUPABASE_URL' },
    { keyName: 'VITE_SUPABASE_ANON_KEY', localKey: 'VITE_SUPABASE_ANON_KEY', prodKey: 'VITE_SUPABASE_ANON_KEY' },
    { keyName: 'VITE_SOCKET_URL', localKey: 'VITE_SOCKET_URL', prodKey: 'VITE_SOCKET_SERVER_URL' }
];

for (const item of keysToCheck) {
    const localVal = localEnv[item.localKey];
    const prodVal = prodEnv[item.prodKey];

    if (!localVal) {
        console.log(`- Local ${item.localKey} is missing!`);
        continue;
    }
    if (!prodVal) {
        console.log(`- Vercel ${item.prodKey} is missing!`);
        continue;
    }

    const matches = localVal === prodVal;
    console.log(`- ${item.keyName}:`);
    console.log(`  Local:   length=${localVal.length}, prefix="${localVal.substring(0, 15)}"`);
    console.log(`  Vercel:  length=${prodVal.length}, prefix="${prodVal.substring(0, 15)}"`);
    console.log(`  MATCHES: ${matches ? '✅ Yes' : '❌ No'}`);
}
