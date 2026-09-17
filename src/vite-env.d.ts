/// <reference types="vite/client" />

/**
 * The application version, injected by Vite from package.json (see the `define`
 * block in vite.config.ts).
 *
 * Declared here rather than read from package.json at runtime, so the renderer
 * bundle does not pull the whole manifest — including its dependency list — in
 * to display one string.
 */
declare const __APP_VERSION__: string;
