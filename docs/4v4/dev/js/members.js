// メンバー（登録名簿）と出場メンバー選択の純粋ロジック。
// 登録は { id, name } の配列。試合の選択（lineup）は id の配列で、最大 MAX_LINEUP 人。
// 終了した試合には、その時点の名前を写して保存する（後で改名・削除しても履歴は変わらない）。

export const MAX_LINEUP = 6; // コート4人＋交代要員
export const MAX_NAME_LEN = 12;
export const MAX_MEMBERS = 30;

export function normalizeName(raw) {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

// 名前の検証。問題なければ null、あればエラーメッセージ。
export function validateName(members, raw, exceptId = null) {
  const name = normalizeName(raw);
  if (name === '') return '名前を入力してください';
  if ([...name].length > MAX_NAME_LEN) return `名前は${MAX_NAME_LEN}文字までです`;
  if (members.some((m) => m.id !== exceptId && m.name === name)) return '同じ名前がすでに登録されています';
  return null;
}

function nextId(members) {
  let max = 0;
  for (const m of members) {
    const n = Number(String(m.id).replace(/^p/, ''));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `p${max + 1}`;
}

// 追加。検証に通らない・上限超過のときは元の配列をそのまま返す。
export function addMember(members, raw) {
  if (members.length >= MAX_MEMBERS || validateName(members, raw)) return members;
  return [...members, { id: nextId(members), name: normalizeName(raw) }];
}

export function renameMember(members, id, raw) {
  if (!members.some((m) => m.id === id) || validateName(members, raw, id)) return members;
  const name = normalizeName(raw);
  return members.map((m) => (m.id === id ? { ...m, name } : m));
}

export function removeMember(members, id) {
  return members.filter((m) => m.id !== id);
}

// 選択のオン/オフ。5人目は選べず、元の配列を返す。
export function toggleLineup(lineup, id, max = MAX_LINEUP) {
  if (lineup.includes(id)) return lineup.filter((x) => x !== id);
  if (lineup.length >= max) return lineup;
  return [...lineup, id];
}

// 登録順に並べたメンバー {id,name} の写しを返す（保存用）。登録にない id は無視。
export function snapshot(members, lineup) {
  const set = new Set(lineup);
  return members.filter((m) => set.has(m.id)).map((m) => ({ id: m.id, name: m.name }));
}

// 保存データの検証。壊れた要素・重複 id・重複名は除く。
export function sanitize(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = new Set();
  const names = new Set();
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || m.id === '') continue;
    const name = normalizeName(m.name);
    if (name === '' || [...name].length > MAX_NAME_LEN || ids.has(m.id) || names.has(name)) continue;
    ids.add(m.id);
    names.add(name);
    out.push({ id: m.id, name });
    if (out.length >= MAX_MEMBERS) break;
  }
  return out;
}

// 選択の検証。登録にある id だけ・重複なし・最大人数まで。
export function sanitizeLineup(raw, members) {
  if (!Array.isArray(raw)) return [];
  const known = new Set(members.map((m) => m.id));
  const out = [];
  for (const id of raw) {
    if (typeof id === 'string' && known.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_LINEUP) break;
  }
  return out;
}
