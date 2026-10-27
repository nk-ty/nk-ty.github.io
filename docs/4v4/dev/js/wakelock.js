// Screen Wake Lock: 計時中に画面が消灯しないようにする。
// 非対応環境・取得失敗時は false を返すだけで、アプリの動作は止めない。

let sentinel = null;

export function isSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export async function acquire() {
  if (!isSupported()) return false;
  if (sentinel) return true;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
    return true;
  } catch {
    sentinel = null;
    return false;
  }
}

export async function release() {
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    // 無視
  }
  sentinel = null;
}
