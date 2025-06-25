// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_GL_API: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
