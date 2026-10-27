// チームの純粋ロジック。チームは { id, name, memberIds }。メンバーは共通の名簿で、複数チームを兼任できる。

export const MAX_TEAM_NAME_LEN = 16;
export const MAX_TEAMS = 20;

export function normalizeName(raw) {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

// 問題なければ null、あればエラーメッセージ。
export function validateTeamName(teams, raw, exceptId = null) {
  const name = normalizeName(raw);
  if (name === '') return 'チーム名を入力してください';
  if ([...name].length > MAX_TEAM_NAME_LEN) return `チーム名は${MAX_TEAM_NAME_LEN}文字までです`;
  if (teams.some((t) => t.id !== exceptId && t.name === name)) return '同じ名前のチームがすでにあります';
  return null;
}

function nextId(teams) {
  let max = 0;
  for (const t of teams) {
    const n = Number(String(t.id).replace(/^t/, ''));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `t${max + 1}`;
}

function uniqueIds(ids) {
  return Array.isArray(ids) ? [...new Set(ids.filter((x) => typeof x === 'string' && x !== ''))] : [];
}

export function addTeam(teams, raw, memberIds = []) {
  if (teams.length >= MAX_TEAMS || validateTeamName(teams, raw)) return teams;
  return [...teams, { id: nextId(teams), name: normalizeName(raw), memberIds: uniqueIds(memberIds) }];
}

export function updateTeam(teams, id, { name, memberIds }) {
  if (!teams.some((t) => t.id === id)) return teams;
  if (name !== undefined && validateTeamName(teams, name, id)) return teams;
  return teams.map((t) =>
    t.id === id
      ? {
          ...t,
          ...(name !== undefined ? { name: normalizeName(name) } : {}),
          ...(memberIds !== undefined ? { memberIds: uniqueIds(memberIds) } : {}),
        }
      : t,
  );
}

export function removeTeam(teams, id) {
  return teams.filter((t) => t.id !== id);
}

// メンバーを名簿から消したとき、全チームから外す。
export function removeMemberFromTeams(teams, memberId) {
  return teams.map((t) =>
    t.memberIds.includes(memberId) ? { ...t, memberIds: t.memberIds.filter((x) => x !== memberId) } : t,
  );
}

// そのチームのメンバー（名簿の登録順）。
export function teamMembers(team, members) {
  if (!team) return [];
  const set = new Set(team.memberIds);
  return members.filter((m) => set.has(m.id));
}

export function findTeam(teams, id) {
  return teams.find((t) => t.id === id) ?? null;
}

// 保存データの検証。名簿にないメンバー id は外す。
export function sanitize(raw, members) {
  if (!Array.isArray(raw)) return [];
  const known = new Set(members.map((m) => m.id));
  const ids = new Set();
  const names = new Set();
  const out = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || t.id === '') continue;
    const name = normalizeName(t.name);
    if (name === '' || [...name].length > MAX_TEAM_NAME_LEN || ids.has(t.id) || names.has(name)) continue;
    ids.add(t.id);
    names.add(name);
    out.push({ id: t.id, name, memberIds: uniqueIds(t.memberIds).filter((x) => known.has(x)) });
    if (out.length >= MAX_TEAMS) break;
  }
  return out;
}
