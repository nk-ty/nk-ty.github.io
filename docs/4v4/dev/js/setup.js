// 試合の組み合わせ（自分側・相手側のチームと出場メンバー）の純粋ロジック。
// { my: { teamId, lineup }, opp: { teamId, lineup } }。teamId が null なら「チームなし」。
// 同じチームを両側に選べない。同じ人を両側に出せない（兼任はチーム登録上の話）。

import { MAX_LINEUP } from './members.js?v=d1d6009';
import { findTeam } from './teams.js?v=d1d6009';

export const SIDES = ['my', 'opp'];
const other = (side) => (side === 'my' ? 'opp' : 'my');

export function initialSetup() {
  return { my: { teamId: null, lineup: [] }, opp: { teamId: null, lineup: [] } };
}

// チームを選ぶ。登録メンバーが上限以下なら全員（相手側に出ている人を除く）を出場にする。
export function selectTeam(setup, side, teamId, teams) {
  const team = teamId === null ? null : findTeam(teams, teamId);
  if (teamId !== null && !team) return setup;
  if (team && setup[other(side)].teamId === team.id) return setup;
  const taken = new Set(setup[other(side)].lineup);
  const candidates = team ? team.memberIds.filter((id) => !taken.has(id)) : [];
  const lineup = candidates.length <= MAX_LINEUP ? candidates : [];
  return { ...setup, [side]: { teamId: team ? team.id : null, lineup } };
}

// 出場のオン/オフ。上限超過・相手側に出ている人は変えない。
export function toggleMember(setup, side, memberId) {
  const cur = setup[side].lineup;
  if (cur.includes(memberId)) {
    return { ...setup, [side]: { ...setup[side], lineup: cur.filter((x) => x !== memberId) } };
  }
  if (cur.length >= MAX_LINEUP || setup[other(side)].lineup.includes(memberId)) return setup;
  return { ...setup, [side]: { ...setup[side], lineup: [...cur, memberId] } };
}

// 名簿・チームの変更後や読み込み時に、整合をとる。
// 旧形式（出場メンバーの id 配列だけ）も自分側として受け入れる。
export function sanitize(raw, members, teams, legacyLineup = null) {
  const known = new Set(members.map((m) => m.id));
  const out = initialSetup();
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { my: { lineup: legacyLineup ?? [] } };
  const used = new Set();
  for (const side of SIDES) {
    const s = src[side] && typeof src[side] === 'object' ? src[side] : {};
    let teamId = typeof s.teamId === 'string' && findTeam(teams, s.teamId) ? s.teamId : null;
    if (side === 'opp' && teamId !== null && teamId === out.my.teamId) teamId = null;
    const lineup = [];
    for (const id of Array.isArray(s.lineup) ? s.lineup : []) {
      if (typeof id !== 'string' || !known.has(id) || used.has(id) || lineup.length >= MAX_LINEUP) continue;
      lineup.push(id);
      used.add(id);
    }
    out[side] = { teamId, lineup };
  }
  return out;
}
