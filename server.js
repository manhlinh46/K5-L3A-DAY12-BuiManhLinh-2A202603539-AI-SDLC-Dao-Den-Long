// Static server for the web build + local leaderboard API (no extra dependencies).
//   node server.js                                  -> http://localhost:5173 (PORT env to change)
//   node server.js --export-leaderboard out.json    -> writes {"entries": [...]} in rank order and exits
// Leaderboard file: $DDL_DATA_DIR/leaderboard.json (default ./data/leaderboard.json), survives restarts.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addScore, loadEntries, LeaderboardError } from './src/leaderboard.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
export const LEADERBOARD_FILE = join(resolve(process.env.DDL_DATA_DIR || join(ROOT, 'data')), 'leaderboard.json');
const ALLOWED = ['web', 'src', join('node_modules', 'three', 'build'), 'game.contract.json'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const json = (res, code, body) => res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(body));

async function api(req, res, url) {
  if (url === '/api/leaderboard' && req.method === 'GET') return json(res, 200, { entries: loadEntries(LEADERBOARD_FILE) });
  if (url === '/api/leaderboard' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) return json(res, 413, { error: 'payload too large' });
    }
    try {
      const { entry, entries, rank } = addScore(LEADERBOARD_FILE, JSON.parse(body));
      return json(res, 200, { entry, entries, rank });
    } catch (e) {
      return json(res, e instanceof LeaderboardError || e instanceof SyntaxError ? 400 : 500, { error: e.message });
    }
  }
  return json(res, 404, { error: 'not found' });
}

export function startServer(port = Number(process.env.PORT) || 5173, host) {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url.startsWith('/api/')) return api(req, res, url);
    const rel = normalize(url === '/' ? 'web/index.html' : url.slice(1));
    if (rel.startsWith('..') || !ALLOWED.some((a) => rel === a || rel.startsWith(a + sep))) return res.writeHead(404).end('not found');
    try {
      const body = await readFile(join(ROOT, rel));
      res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => ok(server));
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const i = process.argv.indexOf('--export-leaderboard');
  if (i !== -1) {
    const out = process.argv[i + 1];
    if (!out) {
      process.stderr.write('usage: node server.js --export-leaderboard out.json\n');
      process.exit(1);
    }
    writeFileSync(out, JSON.stringify({ entries: loadEntries(LEADERBOARD_FILE) }, null, 2) + '\n');
    console.log(`exported ${loadEntries(LEADERBOARD_FILE).length} entries to ${out}`);
  } else {
    startServer()
      .then((s) => console.log(`Đảo Đèn Lồng: http://localhost:${s.address().port}`))
      .catch((e) => {
        process.stderr.write(e.code === 'EADDRINUSE' ? `Cổng ${e.port} đang được dùng (có thể game đã chạy sẵn). Mở http://localhost:${e.port} hoặc đặt PORT khác, ví dụ: PORT=5174 npm start\n` : `${e.stack}\n`);
        process.exit(1);
      });
  }
}
