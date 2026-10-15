import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createMonitor, PROBE_INTERVAL_MS, toPublicSnapshot } from './lib/monitor.js';
import { createHistoryStore, HISTORY_RANGES } from './lib/history.js';

const root = dirname(fileURLToPath(import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);
const monitor = createMonitor();
const history = createHistoryStore({ path: process.env.HISTORY_FILE || join(root, 'data', 'history.jsonl') });
const port = Number.parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '127.0.0.1';

await history.load();

async function checkAndRecord() {
  const snapshot = await monitor.check();
  await history.record(snapshot);
}

function send(response, status, body, contentType) {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const pathname = url.pathname;
  if (request.method !== 'GET') {
    send(response, 405, 'Method Not Allowed', 'text/plain; charset=utf-8');
    return;
  }
  if (pathname === '/api/status') {
    const snapshot = monitor.getSnapshot();
    send(response, snapshot ? 200 : 503, JSON.stringify(snapshot ? toPublicSnapshot(snapshot) : { error: '正在进行首次探测' }), 'application/json; charset=utf-8');
    return;
  }
  if (pathname === '/api/history') {
    const range = url.searchParams.get('range') || '2h';
    if (!Object.hasOwn(HISTORY_RANGES, range)) {
      send(response, 400, JSON.stringify({ error: '无效时间范围' }), 'application/json; charset=utf-8');
      return;
    }
    send(response, 200, JSON.stringify(history.getTimeline(range)), 'application/json; charset=utf-8');
    return;
  }
  const asset = assets.get(pathname);
  if (!asset) {
    send(response, 404, 'Not Found', 'text/plain; charset=utf-8');
    return;
  }
  try {
    const content = await readFile(join(root, 'public', asset[0]));
    send(response, 200, content, asset[1]);
  } catch {
    send(response, 500, 'Internal Server Error', 'text/plain; charset=utf-8');
  }
});

server.listen(port, host, () => {
  console.log(`状态页运行于 http://${host}:${port}`);
  checkAndRecord().catch((error) => console.error('探测或历史记录失败:', error));
});

const timer = setInterval(() => {
  checkAndRecord().catch((error) => console.error('探测或历史记录失败:', error));
}, PROBE_INTERVAL_MS);
timer.unref();

function shutdown() {
  clearInterval(timer);
  server.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
