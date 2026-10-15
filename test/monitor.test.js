import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, createMonitor, TARGETS, toPublicSnapshot } from '../lib/monitor.js';

function results({ auth = false, characters = false, worldUp = 0 } = {}) {
  let worldIndex = 0;
  return TARGETS.map((target) => ({
    ...target,
    online: target.group === 'auth' ? auth : target.group === 'characters' ? characters : worldIndex++ < worldUp
  }));
}

test('login and character failures take precedence over world nodes', () => {
  assert.equal(classify(results({ worldUp: 8 })).level, 'offline');
  assert.equal(classify(results({ auth: true, worldUp: 8 })).level, 'restricted');
});

test('eight world nodes use the confirmed addresses across four subnets', () => {
  assert.deepEqual(TARGETS.filter((target) => target.group === 'world').map((target) => target.host), [
    '66.40.176.132', '66.40.176.178', '66.40.177.113',
    '66.40.178.104', '66.40.178.154', '66.40.178.196',
    '66.40.179.205', '66.40.179.232'
  ]);
});

test('eight world nodes use N-1 and majority thresholds', () => {
  for (const worldUp of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const status = classify(results({ auth: true, characters: true, worldUp }));
    assert.equal(status.worldTotal, 8);
    assert.equal(status.worldConnected, worldUp);
    assert.equal(status.worldLevel, worldUp <= 4 ? 'offline' : worldUp < 7 ? 'limited' : 'healthy');
    assert.equal(status.world, worldUp >= 7);
    assert.equal(status.level, worldUp <= 4 ? 'offline' : worldUp < 7 ? 'partial' : 'online');
  }
});

test('half of an even number of world nodes is unavailable', () => {
  for (const [worldUp, level] of [[3, 'offline'], [4, 'limited'], [5, 'healthy']]) {
    const sixNodes = results({ auth: true, characters: true, worldUp }).slice(0, -2);
    assert.equal(classify(sixNodes).worldLevel, level);
  }
});

test('authentication and character probes use the discovered DNS names', () => {
  assert.deepEqual(TARGETS.slice(0, 2).map(({ host, port }) => [host, port]), [
    ['oauth.integration.battle.net', 443],
    ['prod.depot.battle.net', 443]
  ]);
});

test('public status omits addresses, latencies and node counts', () => {
  const sampled = results({ auth: true, characters: true, worldUp: 7 });
  const snapshot = { checkedAt: '2026-10-09T12:00:00.000Z', status: classify(sampled), endpoints: sampled };
  const publicSnapshot = toPublicSnapshot(snapshot);
  assert.deepEqual(publicSnapshot, {
    checkedAt: snapshot.checkedAt,
    status: {
      level: 'online', title: '服务器在线', detail: '登录、角色信息与游戏世界连接正常',
      auth: true, characters: true, worldLevel: 'healthy'
    }
  });
  assert.doesNotMatch(JSON.stringify(publicSnapshot), /66\.40\.|\b\d+\/\d+\b|worldConnected|worldTotal|latencyMs/);
});

test('monitor stores the latest complete sample and handles probe errors', async () => {
  const monitor = createMonitor({
    now: () => new Date('2026-10-09T12:00:00.000Z'),
    probe: async (target) => {
      if (['world-176-132', 'world-176-178', 'world-177-113'].includes(target.id)) throw Object.assign(new Error('failed'), { code: 'ECONNREFUSED' });
      return { ...target, online: true, latencyMs: 12, reason: null };
    }
  });
  assert.equal(monitor.getSnapshot(), null);
  const snapshot = await monitor.check();
  assert.equal(snapshot.checkedAt, '2026-10-09T12:00:00.000Z');
  assert.equal(snapshot.status.level, 'partial');
  assert.equal(snapshot.status.worldConnected, 5);
  assert.equal(snapshot.endpoints[2].reason, 'ECONNREFUSED');
  assert.equal(monitor.getSnapshot(), snapshot);
});

test('overlapping checks share one set of probes', async () => {
  let calls = 0;
  const monitor = createMonitor({ probe: async (target) => {
    calls += 1;
    await Promise.resolve();
    return { ...target, online: true, latencyMs: 1, reason: null };
  } });
  const [first, second] = await Promise.all([monitor.check(), monitor.check()]);
  assert.equal(first, second);
  assert.equal(calls, TARGETS.length);
});
