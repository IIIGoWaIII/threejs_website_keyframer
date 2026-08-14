/**
 * Typed three.js r160 + addons loader.
 *
 * The library is built to an IIFE with `three` and `three/addons/*` marked
 * external, so the runtime `import('three')` / `import('three/addons/...')`
 * calls survive into the bundle. The host page is expected to provide an
 * import map for those specifiers; if none exists we inject a jsDelivr CDN
 * import map into document.head and retry — mirroring the original
 * model-story.js behavior exactly.
 */

import type * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export interface ThreeModules {
  THREE: typeof import('three');
  GLTFLoader: typeof GLTFLoader;
  RoomEnvironment: typeof RoomEnvironment;
  MeshoptDecoder: typeof MeshoptDecoder;
  TransformControls: typeof TransformControls;
}

function importModules(): Promise<ThreeModules> {
  return Promise.all([
    import('three'),
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
    import('three/addons/controls/TransformControls.js'),
  ]).then(([THREE, gltf, roomEnv, meshopt, transformControls]) => ({
    THREE,
    GLTFLoader: gltf.GLTFLoader,
    RoomEnvironment: roomEnv.RoomEnvironment,
    MeshoptDecoder: meshopt.MeshoptDecoder,
    TransformControls: transformControls.TransformControls,
  }));
}

/**
 * Loads three.js r160 + addons. Tries the host page's import map first; on
 * failure injects a CDN import map into document.head and retries.
 */
export function loadThree(): Promise<ThreeModules> {
  return importModules().catch(() => {
    const im = document.createElement('script');
    im.type = 'importmap';
    im.textContent = JSON.stringify({
      imports: {
        'three': 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
        'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/',
      },
    });
    document.head.appendChild(im);
    return importModules();
  });
}
