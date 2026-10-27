// 設定の純粋ロジック。試合時間（カウントダウンの長さ）と交代間隔を持つ。

export const DEFAULT_MATCH_SEC = 10 * 60; // 既定は10分
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 120;
export const DEFAULT_SWAP_SEC = 5 * 60; // 既定は5分交代
export const MAX_SWAP_MINUTES = 60; // 0分 = 通知オフ

export function defaultSettings() {
  return { matchSec: DEFAULT_MATCH_SEC, swapSec: DEFAULT_SWAP_SEC };
}

export function matchMinutes(settings) {
  return Math.round(settings.matchSec / 60);
}

// 交代間隔（分）。0 は通知オフ。
export function swapMinutes(settings) {
  return Math.round(settings.swapSec / 60);
}

// 分単位で試合時間を設定する。範囲外・整数でない値は何も変えない。
export function setMatchMinutes(settings, minutes) {
  if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) return settings;
  return { ...settings, matchSec: minutes * 60 };
}

// 分単位で交代間隔を設定する（0 でオフ）。範囲外・整数でない値は何も変えない。
export function setSwapMinutes(settings, minutes) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_SWAP_MINUTES) return settings;
  return { ...settings, swapSec: minutes * 60 };
}

// 保存データが壊れていても落ちないよう、読み込んだ値を検証して正規化する。項目ごとに既定へ戻す。
export function sanitize(raw) {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const m = raw.matchSec;
  const s = raw.swapSec;
  const matchOk = Number.isInteger(m) && m >= MIN_MINUTES * 60 && m <= MAX_MINUTES * 60;
  const swapOk = Number.isInteger(s) && s % 60 === 0 && s >= 0 && s <= MAX_SWAP_MINUTES * 60;
  return { matchSec: matchOk ? m : d.matchSec, swapSec: swapOk ? s : d.swapSec };
}
