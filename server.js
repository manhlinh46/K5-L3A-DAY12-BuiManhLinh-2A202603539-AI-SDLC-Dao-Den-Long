// Minimal static server for the web build (no extra dependencies). `npm start` -> http://localhost:5173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const ALLOWED = ['web', 'src', join('node_modules', 'three', 'build'), 'game.contract.json'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = normalize(url === '/' ? 'web/index.html' : url.slice(1));
  if (rel.startsWith('..') || !ALLOWED.some((a) => rel === a || rel.startsWith(a + sep))) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`Đảo Đèn Lồng: http://localhost:${PORT}`));
