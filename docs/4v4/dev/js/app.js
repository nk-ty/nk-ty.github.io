import * as sw from './stopwatch.js';
import * as match from './match.js';
import * as storage from './storage.js';
import * as wakeLock from './wakelock.js';
import { currentEnv, DEV } from './env.js';

const SW_KEY = 'stopwatch';
const MATCH_KEY = 'match';
const TICK_MS = 250; // 表示更新の間隔。経過時間そのものは時刻差から算出する

const $ = (id) => document.getElementById(id);

const els = {
  card: document.querySelector('.stopwatch'),
  status: $('sw-status'),
  clock: $('sw-clock'),
  start: $('btn-start'),
  pause: $('btn-pause'),
  resume: $('btn-resume'),
  reset: $('btn-reset'),
  wakeNote: $('wake-note'),
  scoreMy: $('score-my'),
  scoreOpp: $('score-opp'),
  scoreBtns: document.querySelectorAll('.btn-score'),
  undo: $('btn-undo'),
  idleNote: $('idle-note'),
  timeline: $('timeline'),
  timelineEmpty: $('timeline-empty'),
};

const STATUS_LABEL = {
  [sw.IDLE]: '待機中',
  [sw.RUNNING]: '計時中',
  [sw.PAUSED]: '一時停止中',
};

const TEAM_LABEL = { [match.MY]: '自', [match.OPP]: '相手' };

let state = sw.sanitize(storage.load(SW_KEY, null));
let game = match.sanitize(storage.load(MATCH_KEY, null));
let timerId = null;

function persist() {
  const ok = storage.save(SW_KEY, state) && storage.save(MATCH_KEY, game);
  if (!ok) showNote('保存できませんでした。ブラウザの設定を確認してください。');
}

function showNote(text) {
  els.wakeNote.textContent = text;
  els.wakeNote.hidden = !text;
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
  renderClock();
}

function renderScore() {
  const t = match.totals(game);
  els.scoreMy.textContent = String(t.my);
  els.scoreOpp.textContent = String(t.opp);
  els.undo.disabled = game.events.length === 0;
  els.idleNote.hidden = state.status !== sw.IDLE;

  // 新しい得点が上に来るよう、入力順の逆で表示する
  const items = match.timeline(game).reverse();
  els.timeline.replaceChildren(
    ...items.map((e) => {
      const li = document.createElement('li');
      li.className = `tl-${e.team}`;
      const parts = [
        ['tl-time', sw.formatMarker(e.elapsedSec)],
        ['tl-team', TEAM_LABEL[e.team]],
        ['tl-points', `+${e.points}`],
        ['tl-total', `${e.myTotal} - ${e.oppTotal}`],
      ];
      for (const [cls, text] of parts) {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        li.append(span);
      }
      return li;
    }),
  );
  els.timelineEmpty.hidden = items.length > 0;
}

function render() {
  renderStopwatch();
  renderScore();
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
els.reset.addEventListener('click', () => {
  if (window.confirm('ストップウォッチと得点をすべてリセットします。よろしいですか？')) {
    apply(sw.reset(), match.initialMatch());
  }
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
syncRuntime();
