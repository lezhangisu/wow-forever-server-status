import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PROBE_INTERVAL_MS } from './monitor.js';

export const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const HISTORY_RANGES = Object.freeze({
  '2h': 2 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '30d': HISTORY_RETENTION_MS
});

const MAX_SAMPLE_GAP_MS = PROBE_INTERVAL_MS * 2;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const LEVELS = new Set(['online', 'limited', 'offline']);

function macroStatus(level) {
  if (level === 'online') return 'online';
  if (level === 'partial' || level === 'restricted') return 'limited';
  return 'offline';
}

function lowerBound(samples, time) {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].t < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function createHistoryStore({ path, now = Date.now } = {}) {
  if (!path) throw new Error('history file path is required');
  let samples = [];
  let nextPruneAt = 0;
  let writeQueue = Promise.resolve();

  async function rewrite() {
    const temporaryPath = path + '.tmp';
    const content = samples.map((sample) => JSON.stringify(sample)).join('\n');
    await writeFile(temporaryPath, content ? content + '\n' : '');
    await rename(temporaryPath, path);
  }

  async function load() {
    let content = '';
    try {
      content = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const lines = content.split('\n');
    const lastLine = lines.findLastIndex((line) => line.trim());
    const parsed = [];
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      try {
        const sample = JSON.parse(line);
        if (!Number.isFinite(sample.t) || !LEVELS.has(sample.s)) throw new Error('invalid sample');
        parsed.push({ t: sample.t, s: sample.s });
      } catch (error) {
        if (index !== lastLine) throw new Error('invalid history file', { cause: error });
      }
    }
    const cutoff = now() - HISTORY_RETENTION_MS;
    parsed.sort((first, second) => first.t - second.t);
    samples = parsed.filter((sample) => sample.t >= cutoff && sample.t <= now());
    await mkdir(dirname(path), { recursive: true });
    await rewrite();
    nextPruneAt = now() + PRUNE_INTERVAL_MS;
  }

  function record(snapshot) {
    const sample = { t: Date.parse(snapshot.checkedAt), s: macroStatus(snapshot.status.level) };
    if (!Number.isFinite(sample.t)) return Promise.reject(new Error('invalid check time'));
    const task = writeQueue.catch(() => {}).then(async () => {
      if (samples.length && sample.t <= samples[samples.length - 1].t) return;
      await appendFile(path, JSON.stringify(sample) + '\n');
      samples.push(sample);
      if (now() >= nextPruneAt) {
        const cutoff = now() - HISTORY_RETENTION_MS;
        samples = samples.filter((item) => item.t >= cutoff);
        await rewrite();
        nextPruneAt = now() + PRUNE_INTERVAL_MS;
      }
    });
    writeQueue = task;
    return task;
  }

  function getTimeline(range, to = now()) {
    const duration = HISTORY_RANGES[range];
    if (!duration) throw new RangeError('unsupported history range');
    const from = to - duration;
    const segments = [];
    let cursor = from;

    function add(status, start, end) {
      if (end <= start) return;
      const previous = segments[segments.length - 1];
      if (previous?.status === status && previous.end === start) previous.end = end;
      else segments.push({ start, end, status });
    }

    for (let index = lowerBound(samples, from - MAX_SAMPLE_GAP_MS); index < samples.length; index += 1) {
      const sample = samples[index];
      if (sample.t >= to) break;
      const nextTime = samples[index + 1]?.t ?? Infinity;
      const start = Math.max(from, sample.t);
      const end = Math.min(to, sample.t + MAX_SAMPLE_GAP_MS, nextTime);
      if (end <= start) continue;
      if (start > cursor) add('unknown', cursor, start);
      if (end > cursor) {
        add(sample.s, Math.max(cursor, start), end);
        cursor = end;
      }
    }
    add('unknown', cursor, to);
    return { from, to, range, segments };
  }

  return { load, record, getTimeline };
}
