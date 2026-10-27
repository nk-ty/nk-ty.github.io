// ストップウォッチの純粋ロジック。DOM・保存には依存しない。
// 経過時間は setInterval の回数ではなく、時刻の差から算出する。
// これにより画面ロック・別アプリ切替・リロードをまたいでもずれない。

export const IDLE = 'idle';
export const RUNNING = 'running';
export const PAUSED = 'paused';

const STATUSES = [IDLE, RUNNING, PAUSED];

export function initialState() {
  return { status: IDLE, startedAtMs: null, accumulatedMs: 0 };
}

export function elapsedMs(state, nowMs) {
  if (state.status === RUNNING) {
    // 端末の時計が巻き戻っても負の値にしない
    return state.accumulatedMs + Math.max(0, nowMs - state.startedAtMs);
  }
  return state.accumulatedMs;
}

export function elapsedSec(state, nowMs) {
  return Math.floor(elapsedMs(state, nowMs) / 1000);
}

export function start(state, nowMs) {
  if (state.status !== IDLE) return state;
  return { status: RUNNING, startedAtMs: nowMs, accumulatedMs: 0 };
}

export function pause(state, nowMs) {
  if (state.status !== RUNNING) return state;
  return { status: PAUSED, startedAtMs: null, accumulatedMs: elapsedMs(state, nowMs) };
}

export function resume(state, nowMs) {
  if (state.status !== PAUSED) return state;
  return { status: RUNNING, startedAtMs: nowMs, accumulatedMs: state.accumulatedMs };
}

export function reset() {
  return initialState();
}

// 「05:07」形式。分は99を超えても桁を増やして表示する。
export function formatClock(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 得点タイムライン用の「3'24"」形式（秒入力）。
export function formatMarker(sec) {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, '0')}"`;
}

// 保存データが壊れていても落ちないよう、読み込んだ値を検証して正規化する。
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return initialState();
  const { status, startedAtMs, accumulatedMs } = raw;
  if (!STATUSES.includes(status)) return initialState();
  if (!Number.isFinite(accumulatedMs) || accumulatedMs < 0) return initialState();
  if (status === RUNNING) {
    if (!Number.isFinite(startedAtMs)) return initialState();
    return { status, startedAtMs, accumulatedMs };
  }
  return { status, startedAtMs: null, accumulatedMs };
}
