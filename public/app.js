const $ = (id) => document.getElementById(id);
const REFRESH_MS = 60_000;
const MAX_AGE_MS = 100_000;

const translations = {
  zh: {
    pageTitle: 'WoW Forever 测试服 · WoW Server Status',
    description: 'WoW Forever 测试服的服务器状态概览。',
    homeLabel: 'WoW Forever 测试服状态首页',
    switchLanguage: 'Switch to English',
    switchButton: 'EN',
    navStatus: '服务器状态',
    testRealm: '测试服',
    intro: '查看测试服务器的当前连接状态。',
    currentStatus: '当前状态',
    connectionStatus: '当前连接状态',
    lastChecked: '最近检测',
    auth: '登录验证',
    characters: '角色信息',
    world: '游戏世界',
    overview: '服务状态概览',
    historyTitle: '服务器状态历史',
    historySubtitle: '悬停时间轴查看时间与状态',
    historyRangeLabel: '时间范围',
    historyAxisLabel: '服务器状态历史时间轴',
    range2h: '2 小时',
    range24h: '24 小时',
    range30d: '30 天',
    historyOnline: '在线',
    historyLimited: '受限',
    historyOffline: '下线',
    historyUnknown: '无记录',
    historyNote: '历史记录从启用后开始积累，未记录的时段显示为灰色。',
    historyLoading: '正在加载历史记录…',
    historyLoadError: '历史记录暂时无法加载，请稍后重试。',
    authDescription: '账号登录连接状态',
    charactersDescription: '角色数据连接状态',
    worldDescription: '进入游戏的连接状态',
    refreshEvery: '页面每 60 秒更新',
    manualRefresh: '手动刷新',
    refreshing: '刷新中…',
    nextRefresh: '下次更新',
    secondsSuffix: '秒',
    footerRefresh: '页面每 60 秒更新',
    footnote: '状态根据网络连接情况估算，可能与实际游戏体验存在差异。',
    normal: '正常',
    unavailable: '异常',
    limited: '受限',
    pending: '待检测',
    checkingBadge: '检测中',
    status: {
      authOffline: ['服务器离线', '登录服务暂不可连接'],
      charactersOffline: ['登录受限', '登录服务可连接，角色信息暂不可连接'],
      worldOffline: ['游戏服务不可用', '游戏世界连接不足，可能无法正常进入游戏'],
      worldLimited: ['世界服务受限', '游戏世界连接受限，进入游戏可能受影响'],
      online: ['服务器在线', '登录、角色信息与游戏世界连接正常']
    },
    unknown: {
      checking: ['正在检测', '正在连接测试服务器，请稍候…'],
      stale: ['状态待确认', '最近的探测结果已过期，请检查监测服务。'],
      error: ['状态待确认', '暂时无法获取监测结果，页面将自动重试。']
    }
  },
  en: {
    pageTitle: 'WoW Forever Test Realm · WoW Server Status',
    description: 'Server status overview for the WoW Forever test realm.',
    homeLabel: 'WoW Forever test realm status home',
    switchLanguage: '切换到中文',
    switchButton: '中文',
    navStatus: 'Server status',
    testRealm: 'Test Realm',
    intro: 'See the current connection status of the test realm.',
    currentStatus: 'CURRENT STATUS',
    connectionStatus: 'Connection status',
    lastChecked: 'Last checked',
    auth: 'Login',
    characters: 'Characters',
    world: 'Game world',
    overview: 'Service overview',
    historyTitle: 'Server status history',
    historySubtitle: 'Hover over the timeline to inspect time and status',
    historyRangeLabel: 'Time range',
    historyAxisLabel: 'Server status history timeline',
    range2h: '2 hours',
    range24h: '24 hours',
    range30d: '30 days',
    historyOnline: 'Online',
    historyLimited: 'Limited',
    historyOffline: 'Offline',
    historyUnknown: 'No data',
    historyNote: 'History starts when monitoring is enabled. Unrecorded periods appear gray.',
    historyLoading: 'Loading history…',
    historyLoadError: 'History is temporarily unavailable. Please try again later.',
    authDescription: 'Account login connection',
    charactersDescription: 'Character data connection',
    worldDescription: 'In-game connection',
    refreshEvery: 'Updates every 60 seconds',
    manualRefresh: 'Refresh now',
    refreshing: 'Refreshing…',
    nextRefresh: 'Next update in',
    secondsSuffix: 's',
    footerRefresh: 'Updates every 60 seconds',
    footnote: 'Status is estimated from network connectivity and may differ from the in-game experience.',
    normal: 'Normal',
    unavailable: 'Unavailable',
    limited: 'Limited',
    pending: 'Pending',
    checkingBadge: 'Checking',
    status: {
      authOffline: ['Server Offline', 'The login service is currently unreachable.'],
      charactersOffline: ['Login Limited', 'Login is reachable, but character data is not.'],
      worldOffline: ['Game World Unavailable', 'World connectivity is too limited for reliable gameplay.'],
      worldLimited: ['World Service Limited', 'World connectivity is limited. Entering the game may be affected.'],
      online: ['Server Online', 'Login, characters, and the game world are reachable.']
    },
    unknown: {
      checking: ['Checking status', 'Connecting to the test realm. Please wait…'],
      stale: ['Status unconfirmed', 'The latest check is out of date. Please check the monitoring service.'],
      error: ['Status unconfirmed', 'Unable to load the latest status. The page will retry automatically.']
    }
  }
};

let language = 'zh';
let currentSnapshot = null;
let unknownState = 'checking';
let nextRefresh = Date.now() + REFRESH_MS;
let refreshTimer = null;
let refreshInFlight = false;
let historyRange = '2h';
let historyData = null;
let historyRequestId = 0;
let historyLoading = false;
let historyError = false;
let hoverRatio = null;

function copy() {
  return translations[language];
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date);
}

function formatHistoryTime(time) {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(time));
}

function formatAxisTime(time, index) {
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const options = historyRange === '30d'
    ? { month: 'numeric', day: 'numeric' }
    : { hour: '2-digit', minute: '2-digit', hour12: false };
  const label = new Intl.DateTimeFormat(locale, options).format(new Date(time));
  if (historyRange === '24h' && (index === 0 || index === 4)) {
    const date = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(new Date(time));
    return date + ' ' + label;
  }
  return label;
}

function historyStatusAt(time) {
  if (!historyData) return 'unknown';
  const segments = historyData.segments;
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = segments[middle];
    if (time < segment.start) high = middle - 1;
    else if (time >= segment.end) low = middle + 1;
    else return segment.status;
  }
  return 'unknown';
}

function historyStatusLabel(status) {
  const key = {
    online: 'historyOnline',
    limited: 'historyLimited',
    offline: 'historyOffline',
    unknown: 'historyUnknown'
  }[status];
  return copy()[key];
}

function showHistoryAt(value) {
  if (!historyData) return;
  hoverRatio = Math.max(0, Math.min(0.999999, value));
  const time = historyData.from + hoverRatio * (historyData.to - historyData.from);
  const status = historyStatusAt(time);
  const track = $('history-track');
  const cursorX = hoverRatio * track.clientWidth;
  const tooltipX = Math.max(95, Math.min(track.clientWidth - 95, cursorX));
  const tooltip = $('history-tooltip');
  $('history-cursor').style.left = cursorX + 'px';
  $('history-cursor').hidden = false;
  tooltip.style.left = tooltipX + 'px';
  tooltip.dataset.status = status;
  $('history-tooltip-status').textContent = historyStatusLabel(status);
  $('history-tooltip-time').textContent = formatHistoryTime(time);
  tooltip.hidden = false;
  track.setAttribute('aria-valuenow', String(Math.round(hoverRatio * 100)));
  track.setAttribute('aria-valuetext', formatHistoryTime(time) + ', ' + historyStatusLabel(status));
}

function hideHistoryTooltip() {
  hoverRatio = null;
  $('history-cursor').hidden = true;
  $('history-tooltip').hidden = true;
}

function renderHistory(data) {
  historyData = data;
  historyLoading = false;
  historyError = false;
  const duration = data.to - data.from;
  const bars = document.createDocumentFragment();
  for (const segment of data.segments) {
    const bar = document.createElement('div');
    bar.className = 'history-segment';
    bar.dataset.status = segment.status;
    bar.style.left = ((segment.start - data.from) / duration * 100) + '%';
    bar.style.width = ((segment.end - segment.start) / duration * 100) + '%';
    bars.append(bar);
  }
  $('history-segments').replaceChildren(bars);
  const ticks = document.createDocumentFragment();
  for (let index = 0; index <= 4; index += 1) {
    const tick = document.createElement('span');
    tick.textContent = formatAxisTime(data.from + duration * index / 4, index);
    ticks.append(tick);
  }
  $('history-axis').replaceChildren(ticks);
  $('history-note').textContent = copy().historyNote;
  if (hoverRatio !== null) showHistoryAt(hoverRatio);
}

async function refreshHistory() {
  const requestId = ++historyRequestId;
  const requestedRange = historyRange;
  try {
    const response = await fetch('/api/history?range=' + encodeURIComponent(requestedRange), { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (requestId === historyRequestId && requestedRange === historyRange) renderHistory(data);
  } catch {
    if (requestId === historyRequestId) {
      historyLoading = false;
      historyError = true;
      $('history-note').textContent = copy().historyLoadError;
    }
  }
}

function setHistoryRange(range) {
  if (range === historyRange) return;
  historyRange = range;
  historyData = null;
  historyLoading = true;
  historyError = false;
  hideHistoryTooltip();
  $('history-segments').replaceChildren();
  $('history-axis').replaceChildren();
  $('history-note').textContent = copy().historyLoading;
  for (const button of document.querySelectorAll('[data-range]')) {
    button.setAttribute('aria-pressed', String(button.dataset.range === range));
  }
  refreshHistory();
}

function setStage(id, online) {
  const item = $('stage-' + id);
  item.dataset.online = String(online);
  item.querySelector('.progress-state').textContent = online ? copy().normal : copy().unavailable;
}

function setGroup(id, online) {
  const card = $(id + '-card');
  card.dataset.online = String(online);
  $(id + '-badge').textContent = online ? copy().normal : copy().unavailable;
  setStage(id, online);
}

function setWorldGroup(level) {
  const state = level === 'offline' ? 'false' : level === 'limited' ? 'partial' : 'true';
  const label = level === 'offline' ? copy().unavailable : level === 'limited' ? copy().limited : copy().normal;
  $('world-card').dataset.online = state;
  $('world-badge').textContent = label;
  const stage = $('stage-world');
  stage.dataset.online = state;
  stage.querySelector('.progress-state').textContent = label;
}

function setUnknown(kind) {
  currentSnapshot = null;
  unknownState = kind;
  const [title, detail] = copy().unknown[kind];
  $('status-card').dataset.level = 'checking';
  $('status-title').textContent = title;
  $('status-detail').textContent = detail;
  $('checked-at').textContent = '--';
  for (const id of ['auth', 'characters', 'world']) {
    delete $('stage-' + id).dataset.online;
    $('stage-' + id).querySelector('.progress-state').textContent = copy().pending;
    delete $(id + '-card').dataset.online;
    $(id + '-badge').textContent = copy().checkingBadge;
  }
}

function statusKey(status) {
  if (!status.auth) return 'authOffline';
  if (!status.characters) return 'charactersOffline';
  if (status.worldLevel === 'offline') return 'worldOffline';
  if (status.worldLevel === 'limited') return 'worldLimited';
  return 'online';
}

function render(data) {
  const age = Date.now() - Date.parse(data.checkedAt);
  if (!Number.isFinite(age) || age > MAX_AGE_MS) {
    setUnknown('stale');
    return;
  }
  currentSnapshot = data;
  const { status } = data;
  const [title, detail] = copy().status[statusKey(status)];
  $('status-card').dataset.level = status.level;
  $('status-title').textContent = title;
  $('status-detail').textContent = detail;
  $('checked-at').textContent = formatTime(data.checkedAt);
  setGroup('auth', status.auth);
  setGroup('characters', status.characters);
  setWorldGroup(status.worldLevel);
}

function setLanguage(nextLanguage) {
  language = nextLanguage;
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = copy().pageTitle;
  document.querySelector('meta[name=description]').content = copy().description;
  $('home-link').setAttribute('aria-label', copy().homeLabel);
  $('progress-track').setAttribute('aria-label', copy().overview);
  $('history-ranges').setAttribute('aria-label', copy().historyRangeLabel);
  $('history-track').setAttribute('aria-label', copy().historyAxisLabel);
  $('language-toggle').textContent = copy().switchButton;
  $('language-toggle').setAttribute('aria-label', copy().switchLanguage);
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = copy()[element.dataset.i18n];
  }
  $('refresh-button').textContent = refreshInFlight ? copy().refreshing : copy().manualRefresh;
  if (currentSnapshot) render(currentSnapshot);
  else setUnknown(unknownState);
  if (historyData) renderHistory(historyData);
  else if (historyLoading) $('history-note').textContent = copy().historyLoading;
  else if (historyError) $('history-note').textContent = copy().historyLoadError;
  tick();
}

function scheduleRefresh(delay) {
  clearTimeout(refreshTimer);
  nextRefresh = Date.now() + delay;
  refreshTimer = setTimeout(refresh, delay);
  tick();
}

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  clearTimeout(refreshTimer);
  refreshTimer = null;
  $('refresh-button').disabled = true;
  $('refresh-button').textContent = copy().refreshing;
  let retrySoon = false;
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (response.status === 503) {
      setUnknown('checking');
      retrySoon = true;
    } else if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    } else {
      render(await response.json());
    }
  } catch {
    setUnknown('error');
  } finally {
    await refreshHistory();
    refreshInFlight = false;
    $('refresh-button').disabled = false;
    $('refresh-button').textContent = copy().manualRefresh;
    scheduleRefresh(retrySoon ? 3_000 : REFRESH_MS);
  }
}

function tick() {
  $('header-time').textContent = formatTime(new Date().toISOString());
  $('countdown').textContent = String(Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000)));
}

$('language-toggle').addEventListener('click', () => setLanguage(language === 'zh' ? 'en' : 'zh'));
$('refresh-button').addEventListener('click', refresh);
for (const button of document.querySelectorAll('[data-range]')) {
  button.addEventListener('click', () => setHistoryRange(button.dataset.range));
}
$('history-track').addEventListener('pointermove', (event) => {
  const rect = $('history-track').getBoundingClientRect();
  showHistoryAt((event.clientX - rect.left) / rect.width);
});
$('history-track').addEventListener('pointerleave', hideHistoryTooltip);
$('history-track').addEventListener('focus', () => showHistoryAt(hoverRatio ?? 0.999999));
$('history-track').addEventListener('blur', hideHistoryTooltip);
$('history-track').addEventListener('keydown', (event) => {
  const change = { ArrowLeft: -0.02, ArrowRight: 0.02, Home: -Infinity, End: Infinity }[event.key];
  if (change === undefined) return;
  event.preventDefault();
  showHistoryAt(change === -Infinity ? 0 : change === Infinity ? 0.999999 : (hoverRatio ?? 0.999999) + change);
});
setLanguage('zh');
refresh();
setInterval(tick, 1_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() >= nextRefresh) refresh();
});
