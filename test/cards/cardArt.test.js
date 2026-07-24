import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CARD_CATALOG } from '../../src/cards/CardCatalog.js';

// PNG 8-byte signature.
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('every catalog art path is a unique PNG sprite that exists', async () => {
  const hashes = new Set();
  for (const card of CARD_CATALOG) {
    assert.match(card.art, /^\/assets\/cards\/[a-z0-9_]+\.png$/, `${card.id} art path`);
    const bytes = await readFile(new URL(`../../public${card.art}`, import.meta.url));
    // Valid PNG header
    assert.ok(bytes.subarray(0, 8).equals(PNG_SIG), `${card.id} is a PNG`);
    // IHDR: 96x96, colour type 6 (RGBA) so transparency is preserved
    assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', `${card.id} IHDR`);
    assert.equal(bytes.readUInt32BE(16), 96, `${card.id} width`);
    assert.equal(bytes.readUInt32BE(20), 96, `${card.id} height`);
    assert.equal(bytes[25], 6, `${card.id} is RGBA (has alpha)`);
    hashes.add(bytes.toString('base64'));
  }
  // No two cards share the same image.
  assert.equal(hashes.size, CARD_CATALOG.length);
  assert.equal(CARD_CATALOG.length, 60);
});
