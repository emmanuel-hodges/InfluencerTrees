/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Short commit hash stamped in by scripts/build-web.sh; absent in dev. */
  readonly VITE_COMMIT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
