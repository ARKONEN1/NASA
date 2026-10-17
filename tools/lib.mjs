// Shared helpers for the data pipeline (Node, no native deps).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RAW = path.join(ROOT, 'data', 'raw');
export const BUILD = path.join(ROOT, 'data', 'build');
export const WEB_DATA = path.join(ROOT, 'web', 'data');
for (const d of [RAW, BUILD, WEB_DATA]) fs.mkdirSync(d, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch with retries; returns ArrayBuffer or text. */
export async function fetchRetry(url, { as = 'buffer', tries = 5, timeoutMs = 300000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'analog-atlas/0.1 (Space Apps 2026 student project)' } });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return as === 'text' ? await res.text() : as === 'json' ? await res.json() : await res.arrayBuffer();
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

/** Download a URL to a file once (skips when the file already exists). */
export async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  const buf = await fetchRetry(url);
  fs.writeFileSync(file + '.part', Buffer.from(buf));
  fs.renameSync(file + '.part', file);
  return file;
}

/** Run async jobs with limited concurrency. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
