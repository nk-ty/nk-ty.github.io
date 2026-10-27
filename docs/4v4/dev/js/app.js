import * as sw from './stopwatch.js';
import * as match from './match.js';
import * as history from './history.js';
import * as settingsLib from './settings.js';
import * as storage from './storage.js';
import * as wakeLock from './wakelock.js';
import * as membersLib from './members.js';
import * as alerts from './alerts.js';
import * as notify from './notify.js';
import { currentEnv, DEV } from './env.js';
import { confirmDialog, editEventDialog, durationDialog, swapDialog, memberDialog } from './dialog.js';

const SW_KEY = 'stopwatch';
const MATCH_KEY = 'match';
const HISTORY_KEY = 'history';
const SETTINGS_KEY = 'settings';
const MEMBERS_KEY = 'members';
const LINEUP_KEY = 'lineup';
const DURATION_PRESETS = [5, 8, 10, 12, 15, 20];
const TICK_MS = 250; // 表示更新の間隔。経過時間そのものは時刻差から算出する
const TOAST_MS = 3500;
const SWAP_PRESETS = [0, 3, 4, 5, 6, 8, 10];
// 裏に回ったタブはタイマーが約1秒間隔に間引かれるため、少し余裕を持たせる
const BG_STALE_MS = 5000;
const ALERT_HIDE_MS = { warn: 5000, swap: 8000 };

const $ = (id) => document.getElementById(id);

const els = {
  card: document.querySelector('.stopwatch'),
  status: $('sw-status'),
  clock: $('sw-clock'),
  start: $('btn-start'),
  pause: $('btn-pause'),
  resume: $('btn-resume'),
  reset: $('btn-reset'),
  duration: $('btn-duration'),
  swap: $('btn-swap'),
  swapAlert: $('swap-alert'),
  notifyBtn: $('btn-notify'),
  finish: $('btn-finish'),
  wakeNote: $('wake-note'),
  scoreMy: $('score-my'),
  scoreOpp: $('score-opp'),
  scoreBtns: document.querySelectorAll('.btn-score'),
  undo: $('btn-undo'),
  idleNote: $('idle-note'),
  timeline: $('timeline'),
  timelineEmpty: $('timeline-empty'),
  viewLive: $('view-live'),
  viewHistory: $('view-history'),
  viewMembers: $('view-members'),
  lineupChips: $('lineup-chips'),
  lineupCount: $('lineup-count'),
  lineupEmpty: $('lineup-empty'),
  memberList: $('member-list'),
  membersEmpty: $('members-empty'),
  membersCount: $('members-count'),
  addMember: $('btn-add-member'),
  tabs: document.querySelectorAll('.tab'),
  historyList: $('history-list'),
  historyEmpty: $('history-empty'),
  historyCount: $('history-count'),
  toast: $('toast'),
};

function statusLabel(over) {
  if (state.status === sw.IDLE) return '待機中';
  if (state.status === sw.RUNNING) return over ? '時間超過' : '計時中';
  return over ? '一時停止中（時間超過）' : '一時停止中';
}

const TEAM_LABEL = { [match.MY]: '自', [match.OPP]: '相手' };
const TEAM_NAME = { my: '自チーム', opp: '相手' };
const RESULT_LABEL = { win: '勝ち', draw: '引き分け', loss: '負け' };

let state = sw.sanitize(storage.load(SW_KEY, null));
let game = match.sanitize(storage.load(MATCH_KEY, null));
let records = history.sanitize(storage.load(HISTORY_KEY, null));
let settings = settingsLib.sanitize(storage.load(SETTINGS_KEY, null));
let members = membersLib.sanitize(storage.load(MEMBERS_KEY, null));
// 出場メンバーの選択。試合のリセット・終了では消さず、次の試合に引き継ぐ
let lineup = membersLib.sanitizeLineup(storage.load(LINEUP_KEY, null), members);
// 試合時間を過ぎた瞬間にだけ知らせるため、前回の表示が超過だったかを覚えておく
let overShown = sw.isOvertime(sw.remainingMs(state, Date.now(), settings.matchSec));
// 交代アラートの判定用: 前回確認した経過時間（計時中でないときは null）
let lastAlertMs = null;
let alertTimer = null;
let timerId = null;
let toastTimer = null;

function persist() {
  const ok = storage.save(SW_KEY, state) && storage.save(MATCH_KEY, game);
  if (!ok) showNote('保存できませんでした。ブラウザの設定を確認してください。');
}

function showNote(text) {
  els.wakeNote.textContent = text;
  els.wakeNote.hidden = !text;
}

function showToast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, TOAST_MS);
}

function span(className, text) {
  const s = document.createElement('span');
  s.className = className;
  s.textContent = text;
  return s;
}

// 得点1件分の表示（ライブの履歴と終了した試合で共通）
function eventSpans(e) {
  return [
    span('tl-time', sw.formatMarker(e.elapsedSec)),
    span('tl-team', TEAM_LABEL[e.team]),
    span('tl-points', `+${e.points}`),
    span('tl-total', `${e.myTotal} - ${e.oppTotal}`),
  ];
}

// カウントダウン表示。試合時間を過ぎたら「+mm:ss」で超過時間を表示し、計時は続ける
function renderClock() {
  const remaining = sw.remainingMs(state, Date.now(), settings.matchSec);
  const over = sw.isOvertime(remaining);
  els.clock.textContent = sw.formatCountdown(remaining);
  els.card.dataset.over = String(over);
  els.status.textContent = statusLabel(over);
  // 計時中に試合時間が0を過ぎたときだけ、短く振動で知らせる
  if (over && !overShown && state.status === sw.RUNNING && navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
  overShown = over;
  checkSwapAlerts();
}

function showSwapAlert(kind) {
  els.swapAlert.textContent = alerts.alertText(kind);
  els.swapAlert.dataset.kind = kind;
  els.swapAlert.hidden = false;
  clearTimeout(alertTimer);
  alertTimer = setTimeout(hideSwapAlert, ALERT_HIDE_MS[kind]);
}

function hideSwapAlert() {
  clearTimeout(alertTimer);
  els.swapAlert.hidden = true;
}

// 計時中だけ、前回の確認から今回までに通過した交代アラートを鳴らす
function checkSwapAlerts() {
  if (state.status !== sw.RUNNING) {
    lastAlertMs = null;
    return;
  }
  const cur = sw.elapsedMs(state, Date.now());
  if (lastAlertMs !== null) {
    const hits = alerts.crossedAlerts(lastAlertMs, cur, settings.swapSec, { staleMs: BG_STALE_MS });
    // 同時に複数あっても、最後（いちばん新しい）ものだけ知らせる
    const last = hits[hits.length - 1];
    if (last) {
      notify.play(last.kind);
      showSwapAlert(last.kind);
      // 別アプリを見ているときなどは、端末の通知でも知らせる
      if (document.hidden) {
        notify.showSystem(alerts.alertText(last.kind), `試合 ${sw.formatClock(cur)}`, last.kind);
      }
    }
  }
  lastAlertMs = cur;
}

function renderStopwatch() {
  const hasScores = game.events.length > 0;
  els.card.dataset.status = state.status;
  // 計時中は誤タップ防止のため、試合時間の変更を出さない
  els.duration.hidden = state.status === sw.RUNNING;
  els.duration.textContent = `試合時間 ${settingsLib.matchMinutes(settings)}分`;
  els.swap.hidden = state.status === sw.RUNNING;
  const swapMin = settingsLib.swapMinutes(settings);
  els.swap.textContent = swapMin === 0 ? '交代通知 オフ' : `交代 ${swapMin}分ごと`;
  els.start.hidden = state.status !== sw.IDLE;
  els.pause.hidden = state.status !== sw.RUNNING;
  els.resume.hidden = state.status !== sw.PAUSED;
  // 計時中は誤タップ防止のためリセットを出さない。開始前に得点だけ入れた場合は消せるようにする
  els.reset.hidden = !(state.status === sw.PAUSED || (state.status === sw.IDLE && hasScores));
  // 記録するものがあるときだけ「試合終了」を出す
  els.finish.hidden = state.status === sw.IDLE && !hasScores;
  renderClock();
}

function renderScore() {
  const t = match.totals(game);
  els.scoreMy.textContent = String(t.my);
  els.scoreOpp.textContent = String(t.opp);
  els.undo.disabled = game.events.length === 0;
  els.idleNote.hidden = state.status !== sw.IDLE;

  // 新しい得点が上に来るよう、時間順の逆で表示する。行をタップすると修正できる
  const items = match.timeline(game).reverse();
  els.timeline.replaceChildren(
    ...items.map((e) => {
      const li = document.createElement('li');
      li.className = `tl-${e.team}`;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tl-row';
      row.dataset.id = String(e.id);
      row.setAttribute(
        'aria-label',
        `${sw.formatMarker(e.elapsedSec)} ${TEAM_NAME[e.team]} ${e.points}点。タップして修正`,
      );
      row.append(...eventSpans(e));
      li.append(row);
      return li;
    }),
  );
  els.timelineEmpty.hidden = items.length > 0;
}

function renderLineup() {
  els.lineupCount.textContent = `${lineup.length}/${membersLib.MAX_LINEUP}`;
  els.lineupEmpty.hidden = members.length > 0;
  const full = lineup.length >= membersLib.MAX_LINEUP;
  els.lineupChips.replaceChildren(
    ...members.map((m) => {
      const on = lineup.includes(m.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.id = m.id;
      b.setAttribute('aria-pressed', String(on));
      // 上限まで選択済みのときは、未選択のメンバーを押せなくする
      b.disabled = full && !on;
      b.textContent = m.name;
      return b;
    }),
  );
}

function renderMembers() {
  els.membersEmpty.hidden = members.length > 0;
  els.membersCount.textContent = members.length > 0 ? `${members.length}人` : '';
  els.memberList.replaceChildren(
    ...members.map((m) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'member-row';
      b.dataset.id = m.id;
      b.setAttribute('aria-label', `${m.name}。タップして編集`);
      b.append(span('member-name', m.name), span('member-edit', '編集'));
      li.append(b);
      return li;
    }),
  );
}

function saveMembers() {
  const ok = storage.save(MEMBERS_KEY, members) && storage.save(LINEUP_KEY, lineup);
  if (!ok) showNote('メンバーを保存できませんでした。ブラウザの設定を確認してください。');
}

function buildMatchItem(rec) {
  const s = history.summarize(rec);
  const li = document.createElement('li');
  const details = document.createElement('details');
  details.className = 'match';

  const summary = document.createElement('summary');
  summary.append(
    span('match-date', history.formatDateTime(rec.finishedAtMs)),
    span(`match-result res-${s.result}`, RESULT_LABEL[s.result]),
    span('match-score', `${s.my} - ${s.opp}`),
    span('match-time', sw.formatClock(rec.durationSec * 1000)),
  );
  if (rec.members.length > 0) {
    // 名前の途中で改行しないよう、1人ずつ折り返し不可の span にする
    const names = span('match-members', '');
    rec.members.forEach((m, i) => names.append(span('mm-name', i < rec.members.length - 1 ? `${m.name}・` : m.name)));
    summary.append(names);
  }

  const list = document.createElement('ol');
  list.className = 'match-events';
  const timeline = history.recordTimeline(rec);
  if (timeline.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'tl-empty';
    empty.textContent = '得点なし';
    list.append(empty);
  } else {
    for (const e of timeline) {
      const item = document.createElement('li');
      item.className = `tl-${e.team}`;
      item.append(...eventSpans(e));
      list.append(item);
    }
  }

  details.append(summary, list);
  li.append(details);
  return li;
}

function renderHistory() {
  const list = history.newestFirst(records);
  els.historyList.replaceChildren(...list.map(buildMatchItem));
  els.historyEmpty.hidden = list.length > 0;
  els.historyCount.hidden = list.length === 0;
  els.historyCount.textContent = String(list.length);
}

function render() {
  renderStopwatch();
  renderScore();
  renderLineup();
}

function setView(name) {
  els.viewLive.hidden = name !== 'live';
  els.viewHistory.hidden = name !== 'history';
  els.viewMembers.hidden = name !== 'members';
  for (const tab of els.tabs) {
    if (tab.dataset.view === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (name === 'history') renderHistory();
  if (name === 'members') renderMembers();
  window.scrollTo(0, 0);
}

function startTicking() {
  if (timerId !== null) return;
  timerId = setInterval(renderClock, TICK_MS);
}

function stopTicking() {
  if (timerId === null) return;
  clearInterval(timerId);
  timerId = null;
}

async function syncRuntime() {
  if (state.status === sw.RUNNING) {
    startTicking();
    const ok = await wakeLock.acquire();
    if (!ok && !wakeLock.isSupported()) {
      showNote('この端末では画面の自動消灯を防げません。計時中は画面を点灯したままにしてください。');
    }
  } else {
    stopTicking();
    await wakeLock.release();
  }
}

function apply(nextState, nextGame = game) {
  if (nextState.status !== sw.RUNNING) hideSwapAlert();
  state = nextState;
  game = nextGame;
  persist();
  render();
  syncRuntime();
}

// --- ストップウォッチ ---
// 音はタップ操作の中で許可しておかないと鳴らせない
els.start.addEventListener('click', () => {
  notify.unlock();
  apply(sw.start(state, Date.now()));
});
els.pause.addEventListener('click', () => apply(sw.pause(state, Date.now())));
els.resume.addEventListener('click', () => {
  notify.unlock();
  apply(sw.resume(state, Date.now()));
});
els.swapAlert.addEventListener('click', hideSwapAlert);

els.reset.addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: 'リセットしますか？',
    message: 'タイマーと得点をすべてリセットします。\n履歴には保存されません。',
    okLabel: 'リセット',
    danger: true,
  });
  if (ok) apply(sw.reset(), match.initialMatch());
});

// --- 試合時間の変更 ---
els.duration.addEventListener('click', async () => {
  const result = await durationDialog(settingsLib.matchMinutes(settings), {
    min: settingsLib.MIN_MINUTES,
    max: settingsLib.MAX_MINUTES,
    presets: DURATION_PRESETS,
  });
  if (!result) return;
  const next = settingsLib.setMatchMinutes(settings, result.minutes);
  if (next === settings) return;
  settings = next;
  if (!storage.save(SETTINGS_KEY, settings)) showNote('試合時間を保存できませんでした。');
  // 設定変更で超過の状態が切り替わっても、振動させない
  overShown = sw.isOvertime(sw.remainingMs(state, Date.now(), settings.matchSec));
  render();
});

// --- 交代間隔の変更 ---
els.swap.addEventListener('click', async () => {
  const result = await swapDialog(settingsLib.swapMinutes(settings), {
    max: settingsLib.MAX_SWAP_MINUTES,
    presets: SWAP_PRESETS,
    warnSec: alerts.WARN_SEC,
  });
  if (!result) return;
  const next = settingsLib.setSwapMinutes(settings, result.minutes);
  if (next === settings) return;
  settings = next;
  if (!storage.save(SETTINGS_KEY, settings)) showNote('交代間隔を保存できませんでした。');
  render();
});

// --- 試合終了 → 履歴に保存 ---
els.finish.addEventListener('click', async () => {
  // 確認ダイアログを開いている間も時計は進むため、押した瞬間の値を使う
  const nowMs = Date.now();
  const durationSec = sw.elapsedSec(state, nowMs);
  const events = game.events;
  const t = match.totals(game);
  const label = RESULT_LABEL[match.result(t)];
  const lineupMembers = membersLib.snapshot(members, lineup);
  const lineupNames = lineupMembers.map((m) => m.name);
  const extra = durationSec - settings.matchSec;
  const timeText =
    sw.formatClock(durationSec * 1000) + (extra > 0 ? `（延長 +${sw.formatClock(extra * 1000)}）` : '');

  const ok = await confirmDialog({
    title: '試合を終了しますか？',
    message:
      `最終スコア　自チーム ${t.my} - ${t.opp} 相手（${label}）\n` +
      `試合時間　${timeText}\n` +
      `得点　${events.length}件\n` +
      `メンバー　${lineupNames.length > 0 ? lineupNames.join('・') : '未選択'}\n\n` +
      '履歴に保存して、新しい試合を始められる状態にします。',
    okLabel: '終了して保存',
  });
  if (!ok) return;

  const record = history.createRecord({
    id: history.nextRecordId(records, nowMs),
    finishedAtMs: nowMs,
    durationSec,
    events,
    members: lineupMembers,
  });
  const nextRecords = history.addRecord(records, record);
  // 履歴に保存できなかったときは、進行中の試合を消さない
  if (!storage.save(HISTORY_KEY, nextRecords)) {
    showNote('履歴に保存できませんでした。試合の記録はそのまま残しています。');
    return;
  }
  records = nextRecords;
  apply(sw.reset(), match.initialMatch());
  renderHistory();
  showToast(`履歴に保存しました（${t.my} - ${t.opp} ${label}）`);
});

// --- 得点 ---
for (const btn of els.scoreBtns) {
  btn.addEventListener('click', () => {
    const { team, points } = btn.dataset;
    // 押した瞬間の経過時間を記録する（計時前・停止中でも、その時点の値）
    const sec = sw.elapsedSec(state, Date.now());
    apply(state, match.addScore(game, team, Number(points), sec));
    if (navigator.vibrate) navigator.vibrate(15);
  });
}

els.undo.addEventListener('click', () => apply(state, match.undo(game)));

// 履歴の行をタップして得点を修正・削除する
els.timeline.addEventListener('click', async (e) => {
  const row = e.target.closest('.tl-row');
  if (!row) return;
  const id = Number(row.dataset.id);
  const ev = game.events.find((x) => x.id === id);
  if (!ev) return;

  const result = await editEventDialog(ev, TEAM_NAME);
  if (!result) return;
  if (result.action === 'delete') {
    apply(state, match.removeEvent(game, id));
  } else {
    apply(
      state,
      match.updateEvent(game, id, {
        team: result.team,
        points: result.points,
        elapsedSec: result.elapsedSec,
      }),
    );
  }
});

// --- 端末の通知 ---
function renderNotifyButton() {
  els.notifyBtn.hidden = notify.systemPermission() !== 'default';
}

els.notifyBtn.addEventListener('click', async () => {
  const result = await notify.requestSystemPermission();
  renderNotifyButton();
  if (result === 'granted') {
    notify.showSystem('通知をオンにしました', '交代の15秒前と交代の時刻に知らせます', 'warn');
    showToast('端末の通知をオンにしました');
  } else if (result === 'denied') {
    showNote('通知がブロックされています。ブラウザ（端末）の設定で、このサイトの通知を許可してください。');
  }
});

// --- メンバー ---
els.lineupChips.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  lineup = membersLib.toggleLineup(lineup, chip.dataset.id);
  saveMembers();
  renderLineup();
  if (navigator.vibrate) navigator.vibrate(10);
});

els.addMember.addEventListener('click', async () => {
  const result = await memberDialog(null, {
    validate: (name) => (members.length >= membersLib.MAX_MEMBERS ? `登録は${membersLib.MAX_MEMBERS}人までです` : membersLib.validateName(members, name)),
    maxLen: membersLib.MAX_NAME_LEN,
  });
  if (!result) return;
  members = membersLib.addMember(members, result.name);
  saveMembers();
  renderMembers();
  renderLineup();
});

els.memberList.addEventListener('click', async (e) => {
  const row = e.target.closest('.member-row');
  if (!row) return;
  const member = members.find((m) => m.id === row.dataset.id);
  if (!member) return;
  const result = await memberDialog(member, {
    validate: (name) => membersLib.validateName(members, name, member.id),
    maxLen: membersLib.MAX_NAME_LEN,
  });
  if (!result) return;
  if (result.action === 'delete') {
    members = membersLib.removeMember(members, member.id);
    lineup = membersLib.sanitizeLineup(lineup, members);
  } else {
    members = membersLib.renameMember(members, member.id, result.name);
  }
  saveMembers();
  renderMembers();
  renderLineup();
});

// --- 画面切り替え ---
for (const tab of els.tabs) {
  tab.addEventListener('click', () => setView(tab.dataset.view));
}

// 画面を戻したとき: 表示を最新化し、Wake Lock を再取得する
// （Wake Lock はタブが非表示になると自動で解除されるため）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    render();
    syncRuntime();
  }
});

// テスト環境(/dev/)では、本番と取り違えないようバッジとタイトルで明示する
if (currentEnv() === DEV) {
  $('env-badge').hidden = false;
  document.title = '[DEV] ' + document.title;
  $('manifest-link').href = 'manifest-dev.webmanifest';
}

render();
renderHistory();
syncRuntime();

// 端末の通知の準備（Service Worker 登録・許可ボタン）
notify.registerWorker();
renderNotifyButton();
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
if (!notify.systemSupported() && isIOS && !isStandalone) {
  showNote('iPhoneで端末の通知を使うには、共有メニューの「ホーム画面に追加」から開いてください。');
}
