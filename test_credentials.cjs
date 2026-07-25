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

const env = parseEnv('.env');
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

console.log('Testing Supabase credentials...');
console.log('URL:', url);

const https = require('https');

const req = https.get(`${url}/rest/v1/characters?select=*&limit=1`, {
    headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
    }
}, (res) => {
    console.log('Response Status Code:', res.statusCode);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            console.log('Headers:', res.headers);
            console.log('Response:', data);
        } catch (e) {
            console.log('Response (raw):', data);
        }
        if (res.statusCode === 200) {
            console.log('✅ Supabase Anon Key is VALID!');
        } else {
            console.log('❌ Supabase Anon Key is INVALID (Unauthorized)!');
        }
    });
});

req.on('error', (e) => {
    console.error('Request failed:', e);
});
