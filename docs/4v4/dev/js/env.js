// 公開環境の判定。
// 本番 (/4v4/) とテスト (/4v4/dev/) は同じオリジンなので localStorage を共有してしまう。
// 保存データが混ざらないよう、パスから環境を判定して保存キーの接頭辞を分ける。

export const PROD = 'prod';
export const DEV = 'dev';

// パスに「dev」というディレクトリ名が含まれていれば dev。
// 例: /4v4/dev/, /4v4/dev/index.html → dev  /  /4v4/, /index.html, /4v4/developer/ → prod
export function detectEnv(pathname) {
  return /\/dev(\/|$)/.test(String(pathname)) ? DEV : PROD;
}

export function currentEnv() {
  return typeof location !== 'undefined' ? detectEnv(location.pathname) : PROD;
}

// 本番の接頭辞は従来のまま（既存の保存データを引き継ぐため）。
export function storagePrefix(env) {
  return env === DEV ? '4v4rec:dev:v1:' : '4v4rec:v1:';
}
