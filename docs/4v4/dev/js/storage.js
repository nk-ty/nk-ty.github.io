// 端末内保存（localStorage）の薄いラッパー。
// 容量超過・プライベートモード等で例外になってもアプリが落ちないようにする。

import { currentEnv, storagePrefix } from './env.js?v=d1d6009';

// 環境(本番/dev)ごとに接頭辞を分け、同一オリジンでもデータが混ざらないようにする。
const PREFIX = storagePrefix(currentEnv());

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
    return true;
  } catch {
    return false;
  }
}
