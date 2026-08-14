/**
 * Ambient declarations for the `three/addons/*` import specifiers used at runtime.
 *
 * The built IIFE must keep the literal `import('three/addons/...')` calls intact
 * so the host page's import map (or the injected CDN import map) resolves them at
 * runtime. TypeScript cannot resolve those paths, so we re-export the types from
 * the matching `three/examples/jsm/*` modules shipped by @types/three.
 *
 * NOTE: this file must stay a global script — NO top-level import/export — or the
 * ambient module declarations would stop applying project-wide.
 */

declare module 'three/addons/loaders/GLTFLoader.js' {
  export * from 'three/examples/jsm/loaders/GLTFLoader.js';
}

declare module 'three/addons/environments/RoomEnvironment.js' {
  export * from 'three/examples/jsm/environments/RoomEnvironment.js';
}

declare module 'three/addons/libs/meshopt_decoder.module.js' {
  export * from 'three/examples/jsm/libs/meshopt_decoder.module.js';
}

declare module 'three/addons/controls/TransformControls.js' {
  export * from 'three/examples/jsm/controls/TransformControls.js';
}
