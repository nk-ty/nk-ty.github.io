// 交代アラートの純粋ロジック。経過時間が「交代間隔の倍数」に近づいたら知らせる。
// 例: 5分交代なら 4:45(予告) → 5:00(交代) → 9:45(予告) → 10:00(交代) …

export const WARN = 'warn'; // 交代の少し前
export const SWAP = 'swap'; // 交代の時刻
export const WARN_SEC = 15;
// 画面消灯・バックグラウンドから戻ったとき、これより古い通知は鳴らさない
export const STALE_MS = 3000;

// 前回の確認時刻(prevMs)から今回(curMs)までの間に通過した通知を、時刻順に返す。
// intervalSec が 0 以下なら通知なし。
export function crossedAlerts(prevMs, curMs, intervalSec, { warnSec = WARN_SEC, staleMs = STALE_MS } = {}) {
  if (!Number.isFinite(prevMs) || !Number.isFinite(curMs) || !(curMs > prevMs)) return [];
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) return [];
  const iMs = intervalSec * 1000;
  const wMs = warnSec * 1000;
  const from = Math.max(prevMs, curMs - staleMs);
  const out = [];
  const firstK = Math.max(1, Math.floor(from / iMs));
  const lastK = Math.floor((curMs + wMs) / iMs);
  for (let k = firstK; k <= lastK; k++) {
    const swapAt = k * iMs;
    const warnAt = swapAt - wMs;
    // 予告は交代間隔より短いときだけ意味がある
    if (wMs < iMs && warnAt > from && warnAt <= curMs) out.push({ kind: WARN, atMs: warnAt });
    if (swapAt > from && swapAt <= curMs) out.push({ kind: SWAP, atMs: swapAt });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

export function alertText(kind, warnSec = WARN_SEC) {
  return kind === SWAP ? '交代！' : `あと${warnSec}秒で交代`;
}
