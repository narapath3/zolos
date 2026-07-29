// Minimal static file server for the built Zolos frontend (dist/).
// Serves on 0.0.0.0:PORT (default 80) with SPA fallback to index.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = parseInt(process.env.FRONTEND_PORT) || 80;
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm',
  '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};

async function tryFile(p) {
  try { const s = await stat(p); if (s.isFile()) return p; } catch {}
  return null;
}

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    // Prevent path traversal
    let rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    let filePath = join(ROOT, rel);
    if (!filePath.startsWith(ROOT)) filePath = ROOT;

    let resolved = await tryFile(filePath);
    if (!resolved && (urlPath === '/' || urlPath.endsWith('/'))) {
      resolved = await tryFile(join(filePath, 'index.html'));
    }
    // SPA fallback: unknown non-asset path -> index.html
    if (!resolved && !extname(filePath)) {
      resolved = await tryFile(join(ROOT, 'index.html'));
    }
    if (!resolved) { res.writeHead(404); res.end('Not found'); return; }

    const data = await readFile(resolved);
    const type = MIME[extname(resolved).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Frontend] Serving ${ROOT} on http://0.0.0.0:${PORT}`);
});
