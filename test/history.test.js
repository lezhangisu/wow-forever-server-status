import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createHistoryStore, HISTORY_RETENTION_MS } from '../lib/history.js';

const minute = 60_000;

function snapshot(time, level) {
  return { checkedAt: new Date(time).toISOString(), status: { level } };
}

test('history persists macro status and reloads without endpoint details', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'wow-status-history-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'history.jsonl');
  const currentTime = Date.parse('2026-10-10T12:00:00.000Z');
  const store = createHistoryStore({ path, now: () => currentTime });
  await store.load();
  await store.record(snapshot(currentTime - 90_000, 'online'));
  await store.record(snapshot(currentTime - 45_000, 'restricted'));
  await store.record(snapshot(currentTime - 1_000, 'offline'));

  const reloaded = createHistoryStore({ path, now: () => currentTime });
  await reloaded.load();
  const timeline = reloaded.getTimeline('2h');
  assert.deepEqual(timeline.segments.slice(-3).map(({ status }) => status), ['online', 'limited', 'offline']);
  assert.equal(timeline.segments[0].status, 'unknown');
  assert.doesNotMatch(await readFile(path, 'utf8'), /host|port|latency|restricted/);
});

test('history trims old samples and leaves monitoring gaps uncolored', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'wow-status-history-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'history.jsonl');
  const currentTime = Date.parse('2026-10-10T12:00:00.000Z');
  const old = { t: currentTime - HISTORY_RETENTION_MS - minute, s: 'online' };
  const recent = { t: currentTime - 60 * minute, s: 'limited' };
  await writeFile(path, JSON.stringify(old) + '\n' + JSON.stringify(recent) + '\n');

  const store = createHistoryStore({ path, now: () => currentTime });
  await store.load();
  await store.record(snapshot(currentTime - 3 * minute, 'online'));
  const timeline = store.getTimeline('2h');
  assert.deepEqual(timeline.segments.map(({ status }) => status), ['unknown', 'limited', 'unknown', 'online', 'unknown']);
  assert.doesNotMatch(await readFile(path, 'utf8'), new RegExp(String(old.t)));
  assert.throws(() => store.getTimeline('1h'), RangeError);
});
