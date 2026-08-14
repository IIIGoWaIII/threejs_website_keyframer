import { defineConfig } from 'tsup';
import type { Options } from 'esbuild';

export default defineConfig({
  entry: { 'model-story': 'src/index.ts' },
  format: ['iife'],
  globalName: 'ModelStory',
  outExtension: () => ({ js: '.js' }),
  dts: true,
  clean: true,
  minify: false,
  target: 'es2020',
  splitting: false,
  external: ['three', 'three/addons/*', 'three/examples/jsm/*'],
  // tsup's external handling is implemented via a custom plugin that is only
  // applied to non-IIFE formats, so for IIFE the `external` option above is
  // silently dropped and three/addons would get bundled. Push the externals
  // straight into esbuild's initialOptions instead (dynamic import('three')
  // and import('three/addons/...') must survive into the bundle for the host
  // page's import map / CDN fallback).
  esbuildOptions(options: Options) {
    options.external = ['three', 'three/addons/*', 'three/examples/jsm/*'];
  },
});
