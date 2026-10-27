import * as sw from './stopwatch.js?v=d20688e';
import * as match from './match.js?v=d20688e';
import * as history from './history.js?v=d20688e';
import * as settingsLib from './settings.js?v=d20688e';
import * as storage from './storage.js?v=d20688e';
import * as wakeLock from './wakelock.js?v=d20688e';
import * as membersLib from './members.js?v=d20688e';
import * as teamsLib from './teams.js?v=d20688e';
import * as setupLib from './setup.js?v=d20688e';
import * as stats from './stats.js?v=d20688e';
import * as alerts from './alerts.js?v=d20688e';
import * as notify from './notify.js?v=d20688e';
import { currentEnv, DEV } from './env.js?v=d20688e';
import { confirmDialog, editEventDialog, durationDialog, swapDialog, memberDialog, recordDialog, teamDialog } from './dialog.js?v=d20688e';

const SW_KEY = 'stopwatch';
const MATCH_KEY = 'match';
const HISTORY_KEY = 'history';
const SETTINGS_KEY = 'settings';
const MEMBERS_KEY = 'members';
const LINEUP_KEY = 'lineup'; // 旧形式（自分側の出場メンバーのみ）。読み込み時に setup へ移す
const TEAMS_KEY = 'teams';
const SETUP_KEY = 'setup';
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
  nameMy: $('name-my'),
  nameOpp: $('name-opp'),
  scoreOpp: $('score-opp'),
  scoreBtns: document.querySelectorAll('.btn-score'),
  undo: $('btn-undo'),
  idleNote: $('idle-note'),
  timeline: $('timeline'),
  timelineEmpty: $('timeline-empty'),
  viewLive: $('view-live'),
  viewHistory: $('view-history'),
  viewMembers: $('view-members'),
  side: {
    my: { select: $('team-select-my'), chips: $('lineup-chips'), count: $('lineup-count'), showAll: $('show-all-my') },
    opp: { select: $('team-select-opp'), chips: $('lineup-chips-opp'), count: $('lineup-count-opp'), showAll: $('show-all-opp') },
  },
  teamList: $('team-list'),
  teamsEmpty: $('teams-empty'),
  teamsCount: $('teams-count'),
  addTeam: $('btn-add-team'),
  lineupEmpty: $('lineup-empty'),
  memberList: $('member-list'),
  membersEmpty: $('members-empty'),
  membersCount: $('members-count'),
  addMember: $('btn-add-member'),
  addRecord: $('btn-add-record'),
  statsCard: $('stats-card'),
  statsOverall: $('stats-overall'),
  statsTeams: $('stats-teams'),
  statsRows: $('stats-rows'),
  filterClear: $('filter-clear'),
  clearHistory: $('btn-clear-history'),
  tabs: document.querySelectorAll('.tab'),
  historyList: $('history-list'),
  historyEmpty: $('history-empty'),
  historyCount: $('history-count'),
  toast: $('toast'),
};

function statusLabel(over) {
  if (state.status === sw.IDLE) return '待機中';
  if (state.status === sw.RUNNING) return over ? '時間超過' : '試合中';
  return over ? '一時停止中（時間超過）' : '一時停止中';
}

const TEAM_LABEL = { [match.MY]: '自', [match.OPP]: '相手' };
const DEFAULT_SIDE_NAME = { my: '自チーム', opp: '相手' };
const RESULT_LABEL = { win: '勝ち', draw: '引き分け', loss: '負け' };

let state = sw.sanitize(storage.load(SW_KEY, null));
let game = match.sanitize(storage.load(MATCH_KEY, null));
let records = history.sanitize(storage.load(HISTORY_KEY, null));
let settings = settingsLib.sanitize(storage.load(SETTINGS_KEY, null));
let members = membersLib.sanitize(storage.load(MEMBERS_KEY, null));
let teams = teamsLib.sanitize(storage.load(TEAMS_KEY, null), members);
// 試合の組み合わせ（両側のチームと出場メンバー）。試合のリセット・終了では消さず、次の試合に引き継ぐ
let setup = setupLib.sanitize(storage.load(SETUP_KEY, null), members, teams, storage.load(LINEUP_KEY, null));
// チームを選んだ側でも、チーム外のメンバーを選べるようにする表示切り替え（保存しない）
const showAll = { my: false, opp: false };
// 履歴の絞り込み（チームの key。null なら全試合）。保存しない
let historyFilter = null;

function sideTeam(side) {
  return teamsLib.findTeam(teams, setup[side].teamId);
}

function sideName(side) {
  return sideTeam(side)?.name ?? DEFAULT_SIDE_NAME[side];
}

function sideNames() {
  return { my: sideName('my'), opp: sideName('opp') };
}
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
        `${sw.formatMarker(e.elapsedSec)} ${sideName(e.team)} ${e.points}点。タップして修正`,
      );
      row.append(...eventSpans(e));
      li.append(row);
      return li;
    }),
  );
  els.timelineEmpty.hidden = items.length > 0;
}

function renderTeamSelect(select, side) {
  const otherTeamId = setup[side === 'my' ? 'opp' : 'my'].teamId;
  const options = [new Option(`チームなし（${DEFAULT_SIDE_NAME[side]}）`, '')];
  for (const t of teams) {
    const o = new Option(t.name, t.id);
    // 同じチームを両側に選べない
    o.disabled = t.id === otherTeamId;
    options.push(o);
  }
  select.replaceChildren(...options);
  select.value = setup[side].teamId ?? '';
}

function renderLineup() {
  els.lineupEmpty.hidden = members.length > 0;
  for (const side of setupLib.SIDES) {
    const ui = els.side[side];
    const { lineup } = setup[side];
    const taken = new Set(setup[side === 'my' ? 'opp' : 'my'].lineup);
    renderTeamSelect(ui.select, side);
    ui.select.hidden = teams.length === 0;
    ui.count.textContent = `${lineup.length}/${membersLib.MAX_LINEUP}`;
    const team = sideTeam(side);
    // チームを選んだ側はそのチームのメンバー（＋選択済みの人）だけを出す。「ほかのメンバーも表示」で全員
    const shown = team && !showAll[side] ? members.filter((m) => team.memberIds.includes(m.id) || lineup.includes(m.id)) : members;
    ui.showAll.hidden = !team || shown.length === members.length;
    const full = lineup.length >= membersLib.MAX_LINEUP;
    ui.chips.replaceChildren(
      ...shown.map((m) => {
        const on = lineup.includes(m.id);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.id = m.id;
        b.setAttribute('aria-pressed', String(on));
        // 上限まで選択済み、または相手側に出ている人は押せない
        b.disabled = !on && (full || taken.has(m.id));
        if (!on && taken.has(m.id)) b.classList.add('taken');
        b.textContent = m.name;
        return b;
      }),
    );
  }
}

function renderNames() {
  els.nameMy.textContent = sideName('my');
  els.nameOpp.textContent = sideName('opp');
  for (const btn of els.scoreBtns) btn.setAttribute('aria-label', `${sideName(btn.dataset.team)} ${btn.dataset.points}点`);
}

function renderTeams() {
  els.teamsEmpty.hidden = teams.length > 0;
  els.teamsCount.textContent = teams.length > 0 ? `${teams.length}チーム` : '';
  els.teamList.replaceChildren(
    ...teams.map((t) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'member-row team-row';
      b.dataset.id = t.id;
      b.setAttribute('aria-label', `${t.name}。タップして編集`);
      const names = teamsLib.teamMembers(t, members).map((m) => m.name);
      const info = document.createElement('span');
      info.className = 'team-info';
      info.append(span('member-name', t.name), span('team-members', names.length > 0 ? names.join('・') : 'メンバーなし'));
      b.append(info, span('member-edit', `${names.length}人`));
      li.append(b);
      return li;
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
  // 名簿・チームの変更に合わせて組み合わせの整合をとる
  teams = teamsLib.sanitize(teams, members);
  setup = setupLib.sanitize(setup, members, teams);
  const ok = storage.save(MEMBERS_KEY, members) && storage.save(TEAMS_KEY, teams) && storage.save(SETUP_KEY, setup);
  storage.remove(LINEUP_KEY);
  if (!ok) showNote('メンバーを保存できませんでした。ブラウザの設定を確認してください。');
}

function buildMatchItem(rec) {
  const base = history.summarize(rec);
  // チームで絞り込み中は、そのチームから見た結果・スコアで表示する（相手側で出た試合は左右を入れ替える）
  const flip = historyFilter !== null && rec.oppTeam?.id === historyFilter && rec.myTeam?.id !== historyFilter;
  const FLIP_RESULT = { win: 'loss', loss: 'win', draw: 'draw' };
  const s = flip ? { my: base.opp, opp: base.my, result: FLIP_RESULT[base.result] } : base;
  const li = document.createElement('li');
  const details = document.createElement('details');
  details.className = 'match';
  details.dataset.id = rec.id;

  const summary = document.createElement('summary');
  summary.append(
    span('match-date', history.formatDateTime(rec.finishedAtMs)),
    span(`match-result res-${s.result}`, RESULT_LABEL[s.result]),
    span('match-score', `${s.my} - ${s.opp}`),
    // 手入力の試合は試合時間を持たない
    span('match-time', rec.durationSec > 0 || rec.events.length > 0 ? sw.formatClock(rec.durationSec * 1000) : '—'),
  );
  const myName = rec.myTeam?.name ?? DEFAULT_SIDE_NAME.my;
  const oppName = rec.oppTeam?.name ?? DEFAULT_SIDE_NAME.opp;
  if (rec.myTeam || rec.oppTeam) summary.append(span('match-teams', flip ? `${oppName} vs ${myName}` : `${myName} vs ${oppName}`));
  // 両側の区別が要るときだけ、名前の前にチーム名を付ける
  const labeled = Boolean(rec.myTeam || rec.oppTeam || rec.oppMembers.length > 0);
  const memberLine = (className, list, prefix) => {
    // 名前の途中で改行しないよう、1人ずつ折り返し不可の span にする
    const line = span(className, '');
    if (prefix) line.append(span('mm-side', `${prefix}：`));
    list.forEach((m, i) => line.append(span('mm-name', i < list.length - 1 ? `${m.name}・` : m.name)));
    summary.append(line);
  };
  if (rec.members.length > 0) memberLine('match-members', rec.members, labeled ? myName : '');
  if (rec.oppMembers.length > 0) memberLine('match-members match-members-opp', rec.oppMembers, oppName);

  const list = document.createElement('ol');
  list.className = 'match-events';
  const timeline = history.recordTimeline(rec);
  const noteItem = (text) => {
    const item = document.createElement('li');
    item.className = 'tl-empty';
    item.textContent = text;
    list.append(item);
  };
  if (history.isManual(rec) && rec.events.length === 0) {
    noteItem('手入力の試合（得点の時間なし）');
  } else if (history.isManual(rec)) {
    const t = history.eventTotals(rec);
    noteItem(`スコアは手入力で修正済み（得点の記録では ${t.my} - ${t.opp}）`);
  }
  if (timeline.length === 0 && !history.isManual(rec)) {
    noteItem('得点なし');
  } else {
    for (const e of timeline) {
      const item = document.createElement('li');
      item.className = `tl-${e.team}`;
      item.append(...eventSpans(e));
      list.append(item);
    }
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-ghost btn-edit-record';
  editBtn.dataset.id = rec.id;
  editBtn.textContent = '編集・削除';

  details.append(summary, list, editBtn);
  li.append(details);
  return li;
}

function pct(rate) {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function renderStats() {
  els.statsCard.hidden = records.length === 0;
  if (records.length === 0) return;
  const rows = stats.byTeam(records);
  const usesTeams = !rows.every((r) => r.key === stats.NO_TEAM);
  const line = (label, o) =>
    `${label}　${o.played}試合 ${o.win}勝 ${o.draw}分 ${o.loss}敗（勝率 ${pct(stats.winRate(o))}）\n` +
    `得点 ${o.pf}　失点 ${o.pa}`;
  const selected = rows.find((r) => r.key === historyFilter);
  // どのチームの成績かが分かるように、チーム名を付けて出す。
  // チームを使っているときは全体の勝敗に意味がないため、試合数だけを出す
  if (selected) els.statsOverall.textContent = line(`${selected.name} の成績`, selected);
  else if (usesTeams) els.statsOverall.textContent = `全 ${records.length}試合`;
  else els.statsOverall.textContent = line('自チームの通算', stats.overall(records));
  // チームを使っていないときは、チーム別の表を出さない
  els.statsTeams.hidden = !usesTeams;
  els.statsRows.replaceChildren(
    ...rows.map((r) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stats-row';
      b.dataset.key = r.key;
      b.setAttribute('aria-pressed', String(historyFilter === r.key));
      b.setAttribute('aria-label', `${r.name} ${r.played}試合 ${r.win}勝 ${r.draw}分 ${r.loss}敗。タップでこのチームの試合だけ表示`);
      const diff = r.pf - r.pa;
      b.append(
        span('st-name', r.name),
        span('st-num', String(r.played)),
        span('st-num st-win', String(r.win)),
        span('st-num', String(r.draw)),
        span('st-num st-loss', String(r.loss)),
        span('st-num', diff > 0 ? `+${diff}` : String(diff)),
      );
      return b;
    }),
  );
}

function filterName(key) {
  return stats.byTeam(records).find((r) => r.key === key)?.name ?? '';
}

function renderHistory() {
  // 絞り込み中のチームの試合がなくなったら解除する
  if (historyFilter !== null && stats.filterByTeam(records, historyFilter).length === 0) historyFilter = null;
  renderStats();
  els.filterClear.hidden = historyFilter === null;
  if (historyFilter !== null) els.filterClear.textContent = `${filterName(historyFilter)} の試合のみ　✕ 解除`;
  const list = history.newestFirst(historyFilter === null ? records : stats.filterByTeam(records, historyFilter));
  // 編集後も、開いていた試合は開いたままにする
  const open = new Set([...els.historyList.querySelectorAll('details[open]')].map((d) => d.dataset.id));
  els.historyList.replaceChildren(
    ...list.map((rec) => {
      const li = buildMatchItem(rec);
      if (open.has(rec.id)) li.querySelector('details').open = true;
      return li;
    }),
  );
  els.historyEmpty.hidden = list.length > 0;
  // タブの件数は絞り込みに関係なく全試合数
  els.historyCount.hidden = records.length === 0;
  els.clearHistory.hidden = records.length === 0;
  els.historyCount.textContent = String(records.length);
}

function render() {
  renderStopwatch();
  renderScore();
  renderLineup();
  renderNames();
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
  if (name === 'members') {
    renderTeams();
    renderMembers();
  }
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
      showNote('この端末では画面の自動消灯を防げません。試合中は画面を点灯したままにしてください。');
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
  const lineupMembers = membersLib.snapshot(members, setup.my.lineup);
  const oppMembers = membersLib.snapshot(members, setup.opp.lineup);
  const names = sideNames();
  const lineupNames = lineupMembers.map((m) => m.name);
  const teamRef = (side) => {
    const team = sideTeam(side);
    return team ? { id: team.id, name: team.name } : null;
  };
  const extra = durationSec - settings.matchSec;
  const timeText =
    sw.formatClock(durationSec * 1000) + (extra > 0 ? `（延長 +${sw.formatClock(extra * 1000)}）` : '');

  const ok = await confirmDialog({
    title: '試合を終了しますか？',
    message:
      `最終スコア　${names.my} ${t.my} - ${t.opp} ${names.opp}（${label}）\n` +
      `試合時間　${timeText}\n` +
      `得点　${events.length}件\n` +
      `メンバー　${lineupNames.length > 0 ? lineupNames.join('・') : '未選択'}\n` +
      (oppMembers.length > 0 ? `相手のメンバー　${oppMembers.map((m) => m.name).join('・')}\n` : '') +
      '\n' +
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
    oppMembers,
    myTeam: teamRef('my'),
    oppTeam: teamRef('opp'),
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

  const result = await editEventDialog(ev, sideNames());
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

// --- 履歴の編集・削除・手入力 ---
function saveRecords(next, doneText) {
  if (!storage.save(HISTORY_KEY, next)) {
    showNote('履歴を保存できませんでした。ブラウザの設定を確認してください。');
    return false;
  }
  records = next;
  renderHistory();
  if (doneText) showToast(doneText);
  return true;
}

async function openRecordDialog(rec) {
  // 選択肢: その試合のメンバー・チーム（当時の名前）＋登録中のもの
  const choices = rec ? [...rec.members, ...rec.oppMembers] : [];
  for (const m of members) if (!choices.some((c) => c.id === m.id)) choices.push({ id: m.id, name: m.name });
  const teamChoices = rec ? [rec.myTeam, rec.oppTeam].filter(Boolean) : [];
  for (const t of teams) if (!teamChoices.some((c) => c.id === t.id)) teamChoices.push({ id: t.id, name: t.name });
  const s = rec ? history.summarize(rec) : { my: 0, opp: 0 };
  let note = '';
  if (rec && rec.events.length > 0) {
    const t = history.eventTotals(rec);
    note = `得点の記録では ${t.my} - ${t.opp} です。スコアを変えると、手入力の修正として保存します。`;
  }
  const result = await recordDialog(rec, {
    initial: {
      finishedAtMs: rec ? rec.finishedAtMs : Date.now(),
      my: s.my,
      opp: s.opp,
      // 手入力は今の組み合わせを初期値にする
      myTeamId: rec ? rec.myTeam?.id ?? null : setup.my.teamId,
      oppTeamId: rec ? rec.oppTeam?.id ?? null : setup.opp.teamId,
      myIds: rec ? rec.members.map((m) => m.id) : [...setup.my.lineup],
      oppIds: rec ? rec.oppMembers.map((m) => m.id) : [...setup.opp.lineup],
    },
    teams: teamChoices,
    choices,
    maxMembers: membersLib.MAX_LINEUP,
    maxScore: history.MAX_SCORE,
    toInput: history.toLocalInput,
    fromInput: history.fromLocalInput,
    note,
  });
  if (!result) return;
  if (result.action === 'delete') {
    saveRecords(history.removeRecord(records, rec.id), '試合を削除しました');
    return;
  }
  const pick = (ids) => choices.filter((c) => ids.includes(c.id));
  const team = (id) => teamChoices.find((t) => t.id === id) ?? null;
  const fields = {
    finishedAtMs: result.finishedAtMs,
    members: pick(result.myIds),
    oppMembers: pick(result.oppIds),
    myTeam: team(result.myTeamId),
    oppTeam: team(result.oppTeamId),
    my: result.my,
    opp: result.opp,
  };
  if (rec) {
    saveRecords(history.updateRecord(records, rec.id, fields), '試合を修正しました');
  } else {
    const created = history.createManualRecord({ id: history.nextRecordId(records, Date.now()), ...fields });
    saveRecords(history.addRecord(records, created), `試合を追加しました（${result.my} - ${result.opp}）`);
  }
}

els.historyList.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-edit-record');
  if (!btn) return;
  const rec = records.find((r) => r.id === btn.dataset.id);
  if (rec) openRecordDialog(rec);
});

els.addRecord.addEventListener('click', () => openRecordDialog(null));

// 成績の行をタップして、そのチームの試合だけに絞り込む（もう一度タップで解除）
els.statsRows.addEventListener('click', (e) => {
  const row = e.target.closest('.stats-row');
  if (!row) return;
  historyFilter = historyFilter === row.dataset.key ? null : row.dataset.key;
  renderHistory();
});

// 試合データ（履歴）の一括削除。チーム・メンバーの登録と進行中の試合は残す
els.clearHistory.addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: '試合データをすべて削除しますか？',
    message:
      `終了した試合 ${records.length}件をすべて削除します。元に戻せません。\n` +
      'チーム・メンバーの登録と、進行中の試合は残ります。',
    okLabel: `${records.length}件を削除`,
    danger: true,
  });
  if (!ok) return;
  historyFilter = null;
  saveRecords([], '試合データをすべて削除しました');
});

els.filterClear.addEventListener('click', () => {
  historyFilter = null;
  renderHistory();
});

// --- 出場チーム・メンバー（試合画面） ---
function saveSetup() {
  if (!storage.save(SETUP_KEY, setup)) showNote('出場メンバーを保存できませんでした。');
  storage.remove(LINEUP_KEY);
}

for (const side of setupLib.SIDES) {
  const ui = els.side[side];
  ui.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    setup = setupLib.toggleMember(setup, side, chip.dataset.id);
    saveSetup();
    renderLineup();
    if (navigator.vibrate) navigator.vibrate(10);
  });
  ui.select.addEventListener('change', () => {
    setup = setupLib.selectTeam(setup, side, ui.select.value || null, teams);
    showAll[side] = false;
    saveSetup();
    renderLineup();
    renderNames();
    renderScore();
  });
  ui.showAll.addEventListener('click', () => {
    showAll[side] = true;
    renderLineup();
  });
}

function refreshAfterRosterChange() {
  saveMembers();
  renderMembers();
  renderTeams();
  renderLineup();
  renderNames();
}

// --- チーム ---
els.addTeam.addEventListener('click', async () => {
  const result = await teamDialog(null, {
    members,
    validate: (name) => (teams.length >= teamsLib.MAX_TEAMS ? `チームは${teamsLib.MAX_TEAMS}までです` : teamsLib.validateTeamName(teams, name)),
    maxLen: teamsLib.MAX_TEAM_NAME_LEN,
  });
  if (!result) return;
  teams = teamsLib.addTeam(teams, result.name, result.memberIds);
  refreshAfterRosterChange();
});

els.teamList.addEventListener('click', async (e) => {
  const row = e.target.closest('.team-row');
  if (!row) return;
  const team = teamsLib.findTeam(teams, row.dataset.id);
  if (!team) return;
  const result = await teamDialog(team, {
    members,
    validate: (name) => teamsLib.validateTeamName(teams, name, team.id),
    maxLen: teamsLib.MAX_TEAM_NAME_LEN,
  });
  if (!result) return;
  if (result.action === 'delete') teams = teamsLib.removeTeam(teams, team.id);
  else teams = teamsLib.updateTeam(teams, team.id, { name: result.name, memberIds: result.memberIds });
  refreshAfterRosterChange();
});

// --- メンバー ---
els.addMember.addEventListener('click', async () => {
  const result = await memberDialog(null, {
    validate: (name) => (members.length >= membersLib.MAX_MEMBERS ? `登録は${membersLib.MAX_MEMBERS}人までです` : membersLib.validateName(members, name)),
    maxLen: membersLib.MAX_NAME_LEN,
  });
  if (!result) return;
  members = membersLib.addMember(members, result.name);
  refreshAfterRosterChange();
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
    teams = teamsLib.removeMemberFromTeams(teams, member.id);
  } else {
    members = membersLib.renameMember(members, member.id, result.name);
  }
  refreshAfterRosterChange();
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
