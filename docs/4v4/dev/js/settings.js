// 設定の純粋ロジック。試合時間（カウントダウンの長さ）だけを持つ。

export const DEFAULT_MATCH_SEC = 10 * 60; // 既定は10分
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 120;

export function defaultSettings() {
  return { matchSec: DEFAULT_MATCH_SEC };
}

export function matchMinutes(settings) {
  return Math.round(settings.matchSec / 60);
}

// 分単位で試合時間を設定する。範囲外・整数でない値は何も変えない。
export function setMatchMinutes(settings, minutes) {
  if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) return settings;
  return { ...settings, matchSec: minutes * 60 };
}

// 保存データが壊れていても落ちないよう、読み込んだ値を検証して正規化する。
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return defaultSettings();
  const v = raw.matchSec;
  if (!Number.isInteger(v) || v < MIN_MINUTES * 60 || v > MAX_MINUTES * 60) return defaultSettings();
  return { matchSec: v };
}
