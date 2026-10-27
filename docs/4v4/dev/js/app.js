import * as sw from './stopwatch.js';
import * as match from './match.js';
import * as history from './history.js';
import * as storage from './storage.js';
import * as wakeLock from './wakelock.js';
import { currentEnv, DEV } from './env.js';
import { confirmDialog, editEventDialog } from './dialog.js';

const SW_KEY = 'stopwatch';
const MATCH_KEY = 'match';
const HISTORY_KEY = 'history';
const TICK_MS = 250; // 表示更新の間隔。経過時間そのものは時刻差から算出する
const TOAST_MS = 3500;

const $ = (id) => document.getElementById(id);

const els = {
  card: document.querySelector('.stopwatch'),
  status: $('sw-status'),
  clock: $('sw-clock'),
  start: $('btn-start'),
  pause: $('btn-pause'),
  resume: $('btn-resume'),
  reset: $('btn-reset'),
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
  tabs: document.querySelectorAll('.tab'),
  historyList: $('history-list'),
  historyEmpty: $('history-empty'),
  historyCount: $('history-count'),
  toast: $('toast'),
};

const STATUS_LABEL = {
  [sw.IDLE]: '待機中',
  [sw.RUNNING]: '計時中',
  [sw.PAUSED]: '一時停止中',
};

const TEAM_LABEL = { [match.MY]: '自', [match.OPP]: '相手' };
const TEAM_NAME = { my: '自チーム', opp: '相手' };
const RESULT_LABEL = { win: '勝ち', draw: '引き分け', loss: '負け' };

let state = sw.sanitize(storage.load(SW_KEY, null));
let game = match.sanitize(storage.load(MATCH_KEY, null));
let records = history.sanitize(storage.load(HISTORY_KEY, null));
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

function renderClock() {
  els.clock.textContent = sw.formatClock(sw.elapsedMs(state, Date.now()));
}

function renderStopwatch() {
  const hasScores = game.events.length > 0;
  els.card.dataset.status = state.status;
  els.status.textContent = STATUS_LABEL[state.status];
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
}

function setView(name) {
  els.viewLive.hidden = name !== 'live';
  els.viewHistory.hidden = name !== 'history';
  for (const tab of els.tabs) {
    if (tab.dataset.view === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (name === 'history') renderHistory();
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
  state = nextState;
  game = nextGame;
  persist();
  render();
  syncRuntime();
}

// --- ストップウォッチ ---
els.start.addEventListener('click', () => apply(sw.start(state, Date.now())));
els.pause.addEventListener('click', () => apply(sw.pause(state, Date.now())));
els.resume.addEventListener('click', () => apply(sw.resume(state, Date.now())));

els.reset.addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: 'リセットしますか？',
    message: 'ストップウォッチと得点をすべてリセットします。\n履歴には保存されません。',
    okLabel: 'リセット',
    danger: true,
  });
  if (ok) apply(sw.reset(), match.initialMatch());
});

// --- 試合終了 → 履歴に保存 ---
els.finish.addEventListener('click', async () => {
  // 確認ダイアログを開いている間も時計は進むため、押した瞬間の値を使う
  const nowMs = Date.now();
  const durationSec = sw.elapsedSec(state, nowMs);
  const events = game.events;
  const t = match.totals(game);
  const label = RESULT_LABEL[match.result(t)];

  const ok = await confirmDialog({
    title: '試合を終了しますか？',
    message:
      `最終スコア　自チーム ${t.my} - ${t.opp} 相手（${label}）\n` +
      `試合時間　${sw.formatClock(durationSec * 1000)}\n` +
      `得点　${events.length}件\n\n` +
      '履歴に保存して、新しい試合を始められる状態にします。',
    okLabel: '終了して保存',
  });
  if (!ok) return;

  const record = history.createRecord({
    id: history.nextRecordId(records, nowMs),
    finishedAtMs: nowMs,
    durationSec,
    events,
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
}

render();
renderHistory();
syncRuntime();
