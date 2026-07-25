const fs = require('fs');
const path = require('path');
const file = 'c:/Users/Admin/Desktop/zolos/.env.production.local';
if (!fs.existsSync(file)) {
    console.log('File does not exist');
    process.exit(1);
}
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
for (const line of lines) {
    if (line.includes('VITE_')) {
        const parts = line.split('=');
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim();
        // Remove quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
        }
        console.log(`${key} = "${val.substring(0, 30)}..." (length: ${val.length})`);
    }
}
