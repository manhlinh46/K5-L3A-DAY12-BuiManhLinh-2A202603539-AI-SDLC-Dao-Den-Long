#!/usr/bin/env node
// Ticket-04 benchmark: node scripts/bench.js --seed 42 --duration 30 --out bench.json [--headless]
// Opens a 1280×720 Chromium window (puppeteer) with vsync / frame-rate limit disabled, loads the
// standard bench scene (?bench), warms up 3 s, measures --duration s of frames, writes bench.json.
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer';
import { startServer } from '../server.js';

const PROCESS_START = performance.timeOrigin; // epoch ms when this process started
const run = promisify(execFile);
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? def : argv[i + 1];
};
const seed = Number(opt('seed', 42));
const duration = Number(opt('duration', 30));
const out = opt('out', 'bench.json');
const headless = argv.includes('--headless');
if (!Number.isInteger(seed) || !(duration > 0)) {
  process.stderr.write('usage: bench.js --seed <int> --duration <s> --out <file> [--headless]\n');
  process.exit(1);
}

// RSS of the whole browser process tree (browser + GPU + renderer processes), in MB.
async function treeRssMb(rootPid) {
  try {
    let rows;
    if (process.platform === 'win32') {
      const { stdout } = await run('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress'], { maxBuffer: 1 << 24 });
      rows = JSON.parse(stdout).map((p) => [p.ProcessId, p.ParentProcessId, Number(p.WorkingSetSize) / 1048576]);
    } else {
      const { stdout } = await run('ps', ['-A', '-o', 'pid=,ppid=,rss=']);
      rows = stdout.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)).map(([pid, ppid, kb]) => [pid, ppid, kb / 1024]);
    }
    const kids = new Map();
    for (const [pid, ppid] of rows) kids.set(ppid, [...(kids.get(ppid) || []), pid]);
    const rss = new Map(rows.map(([pid, , mb]) => [pid, mb]));
    let total = 0;
    const stack = [rootPid];
    const seen = new Set();
    while (stack.length) {
      const pid = stack.pop();
      if (seen.has(pid)) continue;
      seen.add(pid);
      total += rss.get(pid) || 0;
      stack.push(...(kids.get(pid) || []));
    }
    return total;
  } catch {
    return null;
  }
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

const server = await startServer(0, '127.0.0.1');
const port = server.address().port;
const browser = await puppeteer.launch({
  headless,
  defaultViewport: { width: 1280, height: 720 },
  args: [
    '--window-size=1280,720',
    '--disable-gpu-vsync', // vsync off
    '--disable-frame-rate-limit', // uncapped requestAnimationFrame
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ],
});
let peakMb = null;
let sampling = false;
let sampler = null;
try {
  const page = await browser.newPage();
  const pid = browser.process()?.pid;
  let firstFrameEpoch = null;
  const result = new Promise((resolve) => page.exposeFunction('__benchReport', resolve));
  await page.exposeFunction('__benchPhase', (phase, epoch) => {
    if (phase === 'first') firstFrameEpoch = epoch;
    if (phase === 'measure' && pid) {
      sampling = true;
      const sample = async () => {
        if (!sampling) return;
        const mb = await treeRssMb(pid);
        if (mb !== null) peakMb = Math.max(peakMb ?? 0, mb);
        if (sampling) sampler = setTimeout(sample, 1000);
      };
      sample();
    }
  });
  page.on('pageerror', (e) => process.stderr.write(`page error: ${e.message}\n`));
  await page.goto(`http://127.0.0.1:${port}/?bench&seed=${seed}&duration=${duration}`);
  const timeoutMs = (duration + 60) * 1000;
  const r = await Promise.race([result, new Promise((_, fail) => setTimeout(() => fail(new Error('bench timed out')), timeoutMs))]);
  sampling = false;
  clearTimeout(sampler);

  const dts = r.dts;
  const N = dts.length;
  const sum = dts.reduce((a, b) => a + b, 0);
  const sorted = [...dts].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * N));
  const worst = sorted.slice(-k);
  const report = {
    contract_version: '1.3',
    avg_fps: round((1000 * N) / sum),
    p1_low_fps: round(1000 / (worst.reduce((a, b) => a + b, 0) / k)),
    frame_ms_p95: round(percentile(sorted, 0.95), 2),
    frames: N,
    load_ms: Math.round(firstFrameEpoch - PROCESS_START),
    peak_mem_mb: peakMb === null ? null : Math.round(peakMb),
    vsync_off: true,
    renderer: `${r.renderer}; ${await browser.version()} via puppeteer 23.11.1`,
    os: `${os.type()} ${os.release()} ${os.arch()}; ${os.cpus()[0]?.model.trim()} ×${os.cpus().length}; ${Math.round(os.totalmem() / 1073741824)} GB RAM`,
    notes: {
      window: `${r.size.join('x')} css px, devicePixelRatio ${r.pixelRatio}, ${headless ? 'headless' : 'headed window'}`,
      scene: `${r.shades} shades (wander), ${r.motes} motes, lit ${r.lit.join(',')}, seed ${seed}`,
      vsync: 'Chromium flags --disable-gpu-vsync --disable-frame-rate-limit (rAF uncapped)',
      peak_mem: 'sum of RSS (WorkingSet on Windows) over the Chromium process tree, sampled every 1 s during the measured window',
    },
  };
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  sampling = false;
  clearTimeout(sampler);
  await browser.close();
  server.close();
}
process.exit(0);
