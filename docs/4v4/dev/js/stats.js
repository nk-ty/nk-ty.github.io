// 成績の集計（純粋ロジック）。履歴の試合から、通算とチーム別の勝/分/負・得点/失点を出す。

import { summarize } from './history.js?v=d1d6009';

export const NO_TEAM = '__none__'; // 自分側にチームを付けていない試合

function empty() {
  return { played: 0, win: 0, draw: 0, loss: 0, pf: 0, pa: 0 };
}

function add(row, pf, pa) {
  row.played += 1;
  row.pf += pf;
  row.pa += pa;
  if (pf > pa) row.win += 1;
  else if (pf < pa) row.loss += 1;
  else row.draw += 1;
}

// 自分側から見た通算成績。
export function overall(records) {
  const row = empty();
  for (const r of records) {
    const s = summarize(r);
    add(row, s.my, s.opp);
  }
  return row;
}

// チームごとの成績。チームは自分側・相手側のどちらで出ても、そのチームから見た結果で数える。
// 自分側にチームのない試合は NO_TEAM（チームなし）として数える。名前は最新の試合のものを使う。
// 試合数の多い順。同数なら勝ちの多い順、負けの少ない順、名前順。
export function byTeam(records) {
  const rows = new Map();
  const latest = new Map();
  const touch = (key, name, at, pf, pa) => {
    if (!rows.has(key)) rows.set(key, { key, name, ...empty() });
    const row = rows.get(key);
    if (!latest.has(key) || at >= latest.get(key)) {
      latest.set(key, at);
      row.name = name;
    }
    add(row, pf, pa);
  };
  for (const r of records) {
    const s = summarize(r);
    if (r.myTeam) touch(r.myTeam.id, r.myTeam.name, r.finishedAtMs, s.my, s.opp);
    else touch(NO_TEAM, 'チームなし', r.finishedAtMs, s.my, s.opp);
    if (r.oppTeam) touch(r.oppTeam.id, r.oppTeam.name, r.finishedAtMs, s.opp, s.my);
  }
  return [...rows.values()].sort(
    (a, b) => b.played - a.played || b.win - a.win || a.loss - b.loss || a.name.localeCompare(b.name, 'ja'),
  );
}

// そのチームが出た試合だけ。
export function filterByTeam(records, key) {
  if (key === NO_TEAM) return records.filter((r) => !r.myTeam);
  return records.filter((r) => r.myTeam?.id === key || r.oppTeam?.id === key);
}

// 勝率（引き分けを除く）。試合がなければ null。
export function winRate(row) {
  const decided = row.win + row.loss;
  return decided === 0 ? null : row.win / decided;
}
