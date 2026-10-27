// 終了した試合（履歴）の純粋ロジック。DOM・保存には依存しない。
// 試合記録は得点イベントを保存し、スコア・勝敗はイベントから算出する。
// ただし手入力の試合や、後からスコアを直した試合は manual: { my, opp } を持ち、そちらを優先する。

import * as match from './match.js';

export function createRecord({ id, finishedAtMs, durationSec, events, members = [] }) {
  return {
    id: String(id),
    finishedAtMs,
    durationSec: Math.max(0, Math.floor(durationSec)),
    events: events.map((e) => ({ ...e })),
    // その試合に出たメンバーの名前（登録の変更に影響されないよう写しを持つ）
    members: members.map((m) => ({ id: m.id, name: m.name })),
  };
}

export function addRecord(history, record) {
  return [...history, record];
}

// 既存の id と重ならない id を作る。
export function nextRecordId(history, nowMs) {
  const used = new Set(history.map((r) => r.id));
  let id = `m${nowMs}`;
  for (let n = 1; used.has(id); n++) id = `m${nowMs}-${n}`;
  return id;
}

export const MAX_SCORE = 999;

function validScore(n) {
  return Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;
}

// 手入力の試合（得点の時間は持たない）。
export function createManualRecord({ id, finishedAtMs, my, opp, members = [] }) {
  return {
    ...createRecord({ id, finishedAtMs, durationSec: 0, events: [], members }),
    manual: { my, opp },
  };
}

export function isManual(record) {
  return record.manual != null;
}

// 得点の記録から計算したスコア（手入力の修正を無視した値）。
export function eventTotals(record) {
  return match.totals({ events: record.events });
}

// 試合の編集。patch: { finishedAtMs?, members?, my?, opp? }
// スコアが得点の記録と同じなら手入力の修正を外し、違えば manual として持つ。
// 手入力の試合（得点の記録なし）は常に manual を持つ。
export function updateRecord(history, id, patch) {
  return history.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r };
    if (Number.isFinite(patch.finishedAtMs)) next.finishedAtMs = patch.finishedAtMs;
    if (Array.isArray(patch.members)) next.members = patch.members.map((m) => ({ id: m.id, name: m.name }));
    if (validScore(patch.my) && validScore(patch.opp)) {
      const t = eventTotals(r);
      if (r.events.length > 0 && t.my === patch.my && t.opp === patch.opp) delete next.manual;
      else next.manual = { my: patch.my, opp: patch.opp };
    }
    return next;
  });
}

export function removeRecord(history, id) {
  return history.filter((r) => r.id !== id);
}

export function summarize(record) {
  const t = isManual(record) ? record.manual : eventTotals(record);
  return { my: t.my, opp: t.opp, result: match.result(t) };
}

export function recordTimeline(record) {
  return match.timeline({ events: record.events });
}

// 新しい試合が先頭。終了時刻が同じなら id の新しい方を先にする。
export function newestFirst(history) {
  return [...history].sort(
    (a, b) => b.finishedAtMs - a.finishedAtMs || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
}

// 端末のローカル時刻で「10/27 19:51」形式。
export function formatDateTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function memberList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string' && m.name !== '')
    .map((m) => ({ id: m.id, name: m.name }));
}

// 保存データが壊れていても落ちないよう、読み込んだ値を検証して正規化する。
// 壊れた1件だけを除外し、他の試合は残す。
export function sanitize(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.id !== 'string' || r.id === '' || seen.has(r.id)) continue;
    if (!Number.isFinite(r.finishedAtMs)) continue;
    if (!Number.isFinite(r.durationSec) || r.durationSec < 0) continue;
    if (!Array.isArray(r.events)) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      finishedAtMs: r.finishedAtMs,
      durationSec: Math.floor(r.durationSec),
      events: match.sanitize({ events: r.events }).events,
      members: memberList(r.members),
      ...(r.manual && validScore(r.manual.my) && validScore(r.manual.opp)
        ? { manual: { my: r.manual.my, opp: r.manual.opp } }
        : {}),
    });
  }
  return out;
}

// <input type="datetime-local"> 用の「2026-10-27T19:51」形式（端末のローカル時刻）。
export function toLocalInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 上の形式を時刻(ms)に戻す。読めなければ null。
export function fromLocalInput(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(text ?? '');
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null; // 2/30 など
  return date.getTime();
}
