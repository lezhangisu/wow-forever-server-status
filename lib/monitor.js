import net from 'node:net';

export const TARGETS = Object.freeze([
  { id: 'auth', group: 'auth', name: '登录验证', host: 'oauth.integration.battle.net', port: 443 },
  { id: 'characters', group: 'characters', name: '角色信息', host: 'prod.depot.battle.net', port: 443 },
  { id: 'world-176-132', group: 'world', name: '游戏世界 176.132', host: '66.40.176.132', port: 3724 },
  { id: 'world-176-178', group: 'world', name: '游戏世界 176.178', host: '66.40.176.178', port: 3724 },
  { id: 'world-177-113', group: 'world', name: '游戏世界 177.113', host: '66.40.177.113', port: 3724 },
  { id: 'world-104', group: 'world', name: '游戏世界 104', host: '66.40.178.104', port: 3724 },
  { id: 'world-154', group: 'world', name: '游戏世界 154', host: '66.40.178.154', port: 3724 },
  { id: 'world-196', group: 'world', name: '游戏世界 196', host: '66.40.178.196', port: 3724 },
  { id: 'world-179-205', group: 'world', name: '游戏世界 179.205', host: '66.40.179.205', port: 3724 },
  { id: 'world-179-232', group: 'world', name: '游戏世界 179.232', host: '66.40.179.232', port: 3724 }
]);

export const PROBE_INTERVAL_MS = 45_000;
export const PROBE_TIMEOUT_MS = 3_000;

export function connectTcp(target, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = net.createConnection({ host: target.host, port: target.port });
    let settled = false;

    function finish(online, reason) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        ...target,
        online,
        latencyMs: online ? Math.round(performance.now() - started) : null,
        reason: online ? null : reason
      });
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, null));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (error) => finish(false, error.code || 'connection_error'));
  });
}

export function classify(results) {
  const auth = results.some((item) => item.group === 'auth' && item.online);
  const characters = results.some((item) => item.group === 'characters' && item.online);
  const worldResults = results.filter((item) => item.group === 'world');
  const worldTotal = worldResults.length;
  const worldConnected = worldResults.filter((item) => item.online).length;
  const worldLevel = worldTotal === 0 || worldConnected <= worldTotal / 2
    ? 'offline'
    : worldConnected >= worldTotal - 1 ? 'healthy' : 'limited';
  const world = worldTotal > 0 && worldLevel === 'healthy';
  const counts = { auth, characters, world, worldConnected, worldTotal, worldLevel };

  if (!auth) return { level: 'offline', rank: 0, title: '服务器离线', detail: '登录服务暂不可连接', ...counts };
  if (!characters) return { level: 'restricted', rank: 1, title: '登录受限', detail: '登录服务可连接，角色信息暂不可连接', ...counts };
  if (worldLevel === 'offline') return { level: 'offline', rank: 0, title: '游戏服务不可用', detail: '游戏世界连接不足，可能无法正常进入游戏', ...counts };
  if (worldLevel === 'limited') return { level: 'partial', rank: 2, title: '世界服务受限', detail: '游戏世界连接受限，进入游戏可能受影响', ...counts };
  return { level: 'online', rank: 3, title: '服务器在线', detail: '登录、角色信息与游戏世界连接正常', ...counts };
}

export function toPublicSnapshot(snapshot) {
  const { level, title, detail, auth, characters, worldLevel } = snapshot.status;
  return { checkedAt: snapshot.checkedAt, status: { level, title, detail, auth, characters, worldLevel } };
}

export function createMonitor({ probe = connectTcp, targets = TARGETS, now = () => new Date() } = {}) {
  let snapshot = null;
  let pending = null;

  async function check() {
    if (pending) return pending;
    pending = (async () => {
      const checkedAt = now().toISOString();
      const results = await Promise.all(targets.map(async (target) => {
        try {
          return await probe(target);
        } catch (error) {
          return { ...target, online: false, latencyMs: null, reason: error.code || 'probe_error' };
        }
      }));
      snapshot = { checkedAt, intervalMs: PROBE_INTERVAL_MS, status: classify(results), endpoints: results };
      return snapshot;
    })().finally(() => { pending = null; });
    return pending;
  }

  return { check, getSnapshot: () => snapshot };
}
