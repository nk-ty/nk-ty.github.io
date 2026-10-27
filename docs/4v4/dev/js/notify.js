// 交代アラートの出力: 音・振動。画面のバナーは app.js が出す。
// ブラウザの制約: 音はユーザー操作後でないと鳴らせないため、「開始/再開」タップで unlock() する。
// iOS Safari は振動に非対応（音とバナーで知らせる）。

import { SWAP } from './alerts.js';

const VIBRATION = {
  warn: [300],
  swap: [500, 150, 500, 150, 500],
};

let ctx = null;

// 開始・再開などのタップ内で呼ぶ。以後、タイマー経由でも音を鳴らせる。
export function unlock() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    // 音が使えなくても、振動とバナーで知らせる
  }
}

function beep(freq, startSec, durSec) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startSec;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durSec + 0.05);
}

export function play(kind) {
  if (navigator.vibrate) navigator.vibrate(VIBRATION[kind] ?? VIBRATION.warn);
  try {
    if (!ctx || ctx.state !== 'running') return;
    if (kind === SWAP) {
      // 高めの音を長く3回
      beep(1320, 0, 0.45);
      beep(1320, 0.65, 0.45);
      beep(1320, 1.3, 0.6);
    } else {
      // 低めの短い音を2回
      beep(880, 0, 0.18);
      beep(880, 0.3, 0.18);
    }
  } catch {
    // 無視
  }
}
