#!/usr/bin/env node
// Builds the static web release: dist/dao-den-long-web/ (serve the folder root with any static server).
// Without server.js there is no /api, so the leaderboard falls back to the browser's localStorage.
import { cpSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dist', 'dao-den-long-web');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'node_modules', 'three', 'build'), { recursive: true });
cpSync(join(ROOT, 'web'), join(OUT, 'web'), { recursive: true });
cpSync(join(ROOT, 'src', 'sim'), join(OUT, 'src', 'sim'), { recursive: true });
copyFileSync(join(ROOT, 'src', 'leaderboard-core.js'), join(OUT, 'src', 'leaderboard-core.js'));
copyFileSync(join(ROOT, 'node_modules', 'three', 'build', 'three.module.js'), join(OUT, 'node_modules', 'three', 'build', 'three.module.js'));
copyFileSync(join(ROOT, 'node_modules', 'three', 'LICENSE'), join(OUT, 'node_modules', 'three', 'LICENSE'));
copyFileSync(join(ROOT, 'game.contract.json'), join(OUT, 'game.contract.json'));
copyFileSync(join(ROOT, 'web', 'index.html'), join(OUT, 'index.html'));
for (const f of ['LICENSE', 'CREDITS.md']) copyFileSync(join(ROOT, f), join(OUT, f));
writeFileSync(
  join(OUT, 'README.txt'),
  [
    'Dao Den Long v1.0.0 - static web build',
    '',
    'Serve THIS folder as the web root (ES modules do not load from file://), for example:',
    '  npx serve .            (Node)    -> open the printed URL',
    '  python3 -m http.server 8000      -> open http://localhost:8000',
    '',
    'The local leaderboard is saved in the browser (localStorage) in this build.',
    'For the on-disk leaderboard, --export-leaderboard, bench and soak, use the source release:',
    '  npm install && npm start',
    '',
  ].join('\n'),
);
console.log(`built ${OUT}`);
