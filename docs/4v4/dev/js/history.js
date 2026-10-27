// 終了した試合（履歴）の純粋ロジック。DOM・保存には依存しない。
// 試合記録は得点イベントだけを保存し、スコア・勝敗は常にイベントから算出する。

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

export function summarize(record) {
  const t = match.totals({ events: record.events });
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
    });
  }
  return out;
}
