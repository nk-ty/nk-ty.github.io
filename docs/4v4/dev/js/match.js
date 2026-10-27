// 試合（得点イベント）の純粋ロジック。DOM・保存には依存しない。
// スコアは保存せず、得点イベントの合計から常に算出する。

export const MY = 'my';
export const OPP = 'opp';
export const POINT_VALUES = [2, 3];

const TEAMS = [MY, OPP];

export function initialMatch() {
  return { events: [], nextId: 1 };
}

// 得点を1件追加する。不正な入力は何も変えずに元の状態を返す。
export function addScore(match, team, points, elapsedSec) {
  if (!TEAMS.includes(team) || !POINT_VALUES.includes(points)) return match;
  const sec = Number.isFinite(elapsedSec) ? Math.max(0, Math.floor(elapsedSec)) : 0;
  return {
    events: [...match.events, { id: match.nextId, team, points, elapsedSec: sec }],
    nextId: match.nextId + 1,
  };
}

// 直前に入力した得点を取り消す（入力順で最後の1件）。
export function undo(match) {
  if (match.events.length === 0) return match;
  return { ...match, events: match.events.slice(0, -1) };
}

export function totals(match) {
  let my = 0;
  let opp = 0;
  for (const e of match.events) {
    if (e.team === MY) my += e.points;
    else opp += e.points;
  }
  return { my, opp };
}

export function result(t) {
  if (t.my > t.opp) return 'win';
  if (t.my < t.opp) return 'loss';
  return 'draw';
}

// 得点イベントの時間・点数・チームを後から修正する。不正な値なら何も変えない。
export function updateEvent(match, id, patch) {
  const idx = match.events.findIndex((e) => e.id === id);
  if (idx < 0) return match;
  const cur = match.events[idx];
  const team = patch.team ?? cur.team;
  const points = patch.points ?? cur.points;
  const elapsedSec = patch.elapsedSec ?? cur.elapsedSec;
  if (!TEAMS.includes(team) || !POINT_VALUES.includes(points)) return match;
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) return match;
  const events = match.events.slice();
  events[idx] = { ...cur, team, points, elapsedSec: Math.floor(elapsedSec) };
  return { ...match, events };
}

// 得点イベントを削除する（誤入力の取り消し用。Undoと違い任意の1件を消せる）。
export function removeEvent(match, id) {
  if (!match.events.some((e) => e.id === id)) return match;
  return { ...match, events: match.events.filter((e) => e.id !== id) };
}

// 時間順（同時刻は入力順）に並べ、各得点の直後のスコアを付けたタイムラインを返す。
// 時間を修正して順序が入れ替わっても、途中経過が正しく再計算される。
export function timeline(match) {
  let my = 0;
  let opp = 0;
  return [...match.events]
    .sort((a, b) => a.elapsedSec - b.elapsedSec || a.id - b.id)
    .map((e) => {
      if (e.team === MY) my += e.points;
      else opp += e.points;
      return { ...e, myTotal: my, oppTotal: opp };
    });
}

function isValidEvent(e) {
  return (
    e &&
    typeof e === 'object' &&
    Number.isInteger(e.id) &&
    TEAMS.includes(e.team) &&
    POINT_VALUES.includes(e.points) &&
    Number.isFinite(e.elapsedSec) &&
    e.elapsedSec >= 0
  );
}

// 保存データが壊れていても落ちないよう、読み込んだ値を検証して正規化する。
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.events)) return initialMatch();
  const seen = new Set();
  const events = [];
  for (const e of raw.events) {
    if (!isValidEvent(e) || seen.has(e.id)) continue;
    seen.add(e.id);
    events.push({
      id: e.id,
      team: e.team,
      points: e.points,
      elapsedSec: Math.floor(e.elapsedSec),
    });
  }
  const maxId = events.reduce((m, e) => Math.max(m, e.id), 0);
  const nextId = Number.isInteger(raw.nextId) && raw.nextId > maxId ? raw.nextId : maxId + 1;
  return { events, nextId };
}
