import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('chat profanity filter censors vulgar Thai words', async () => {
    const serverSource = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');

    // Extract the PROFANITY array literal from the file source
    const match = serverSource.match(/const PROFANITY = \[\s*([\s\S]*?)\s*\]\.sort\(/);
    assert.ok(match, 'PROFANITY array not found in server.js');

    // Parse it back to an array, ignoring comment lines
    const words = match[1]
        .split('\n')
        .map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('//')) return null;
            return trimmed;
        })
        .filter(Boolean)
        .join(' ')
        .split(',')
        .map(w => w.trim().replace(/['"]/g, ''))
        .filter(Boolean);

    const sortedWords = words.slice().sort((a, b) => b.length - a.length);

    // Enforce that sorting logic is correct
    assert.deepEqual(
        words,
        sortedWords,
        'PROFANITY list must be sorted'
    );

    // Build a mock censor function matching server.js logic
    const PROFANITY_RE = words.sort((a, b) => b.length - a.length).map(w => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
    function censor(text) {
        let out = text;
        for (const re of PROFANITY_RE) out = out.replace(re, '***');
        return out;
    }

    assert.equal(censor('ไอ้หน้าหี'), '***');
    assert.equal(censor('ควย'), '***');
    assert.equal(censor('เย็ด'), '***');
    assert.equal(censor('เหี้ย'), '***');
    assert.equal(censor('แตดๆ'), '***');
    assert.equal(censor('สัด'), '***');
    assert.equal(censor('สัส'), '***');
    assert.equal(censor('พ่อมึงตายแม่มึงตาย'), '******');
});
