/**
 * ModelStory — Three.js scroll-story viewer + author-mode keyframe editor.
 *
 * TypeScript rewrite of model-story.js. Public API mirrors the original:
 * ModelStory.create(options) → ModelStoryHandle. The class skeleton (all
 * private fields) and the core viewer methods live here; the keyframe engine
 * and author-mode editor methods are appended after the `// <<<CONTINUE>>>`
 * marker at the bottom of the class.
 */

import type * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadThree, type ThreeModules } from './three';
import type { ModelStoryOptions, ModelStoryHandle, SkipReason, LightsOptions } from './types';

const LOAD_TIMEOUT = 15000;
let activeInstance: ModelStory | null = null;
let styleUsers = 0;

// ---------------------------------------------------------------------------
// Self-contained UI styling (injected once into document.head as #ms3d-styles).
// Accent color is driven by the inherited CSS variable --ms3d-accent, set per
// instance on the editor root / loader element.
// ---------------------------------------------------------------------------
// Blender-like author-mode theme: flat dark panels, square corners, header
// strips, and the Blender orange accent. Layout mirrors Blender's work area —
// a top editor strip, a left tool shelf, a right properties panel, and a
// full-width timeline along the bottom.
const STYLE_CSS = `
.ms3d-editor{position:fixed;inset:0;z-index:100;pointer-events:none;color:#d7d7d7;--bl-bg:#313131;--bl-panel:#383838;--bl-header:#2d2d2d;--bl-btn:#3f3f3f;--bl-btn-hover:#505050;--bl-border:#1d1d1d;--bl-text:#d7d7d7;--bl-dim:#9a9a9a;--bl-input:#464646}
.ms3d-editor *{box-sizing:border-box}
.ms3d-panel{pointer-events:auto;position:absolute;background:var(--bl-panel);border:1px solid var(--bl-border);color:var(--bl-text);font-size:11px;line-height:1.4;box-shadow:0 10px 24px rgba(0,0,0,.45)}
.ms3d-btn{pointer-events:auto;padding:3px 9px;border-radius:0;background:var(--bl-btn);color:var(--bl-text);font-size:11px;line-height:1.3;border:1px solid var(--bl-btn);cursor:pointer;font-family:inherit;white-space:nowrap}
.ms3d-btn:hover{background:var(--bl-btn-hover);border-color:var(--bl-btn-hover)}
.ms3d-btn-primary{background:var(--ms3d-accent,#fa7c1d);color:#161616;border-color:var(--ms3d-accent,#fa7c1d);font-weight:700}
.ms3d-btn-primary:hover{background:#ff9833;border-color:#ff9833}
.ms3d-btn-active{background:var(--ms3d-accent,#fa7c1d);color:#161616;border-color:var(--ms3d-accent,#fa7c1d);font-weight:700}
.ms3d-btn-active:hover{background:#ff9833;border-color:#ff9833}
.ms3d-t-value{color:var(--bl-text);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--bl-input);border:1px solid var(--bl-border);padding:3px 8px;min-width:52px;text-align:center;display:inline-block}
.ms3d-input-range{width:104px;accent-color:var(--ms3d-accent,#fa7c1d)}
.ms3d-shelf .ms3d-input-range{flex:1;min-width:0;width:auto}
.ms3d-input-num{width:44px;border-radius:0;background:var(--bl-input);border:1px solid var(--bl-border);padding:3px 6px;color:var(--bl-text);font-size:11px;font-family:inherit}
.ms3d-input-color{width:20px;height:20px;border-radius:0;border:1px solid var(--bl-border);background:transparent;cursor:pointer;padding:0}
.ms3d-input-color-wide{flex:1;min-width:0;height:22px;border-radius:0;background:var(--bl-input);border:1px solid var(--bl-border);padding:3px;cursor:pointer}
.ms3d-row{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--bl-text)}
.ms3d-row-label{flex:none;width:42px;color:var(--bl-dim)}
.ms3d-dim{color:var(--bl-dim)}
.ms3d-topbar{position:absolute;top:52px;left:0;right:0;height:30px;display:flex;align-items:center;gap:5px;padding:0 8px;background:var(--bl-header);border-bottom:1px solid var(--bl-border)}
.ms3d-brand{display:flex;align-items:center;gap:6px;font-weight:700;color:var(--bl-text);font-size:11px;padding:0 6px;letter-spacing:.02em;cursor:default}
.ms3d-brand-dot{width:10px;height:10px;background:var(--ms3d-accent,#fa7c1d)}
.ms3d-top-sep{width:1px;height:16px;background:var(--bl-border);margin:0 2px;flex:none}
.ms3d-top-spacer{margin-left:auto}
.ms3d-top-label{color:var(--bl-dim);font-size:11px}
.ms3d-shelf{top:92px;left:16px;width:190px}
.ms3d-shelf-handle{display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:var(--bl-header);border-bottom:1px solid var(--bl-border);color:var(--bl-text);cursor:grab;user-select:none;font-weight:600}
.ms3d-shelf-grip{color:var(--bl-dim);font-size:10px}
.ms3d-shelf-body{display:flex;flex-direction:column;gap:8px;padding:8px 10px}
.ms3d-panel-body{top:92px;right:16px;left:auto;width:260px}
.ms3d-panel-head{display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:var(--bl-header);border-bottom:1px solid var(--bl-border);cursor:grab;user-select:none}
.ms3d-panel-title{font-size:11px;font-weight:600;color:var(--bl-text)}
.ms3d-panel-tools{display:flex;align-items:center;gap:4px}
.ms3d-panel-reset{font-size:10px;color:var(--bl-dim);background:none;border:none;cursor:pointer;padding:2px 6px;font-family:inherit}
.ms3d-panel-reset:hover{color:var(--ms3d-accent,#fa7c1d);background:var(--bl-btn)}
.ms3d-close-btn{background:none;border:none;color:var(--bl-dim);cursor:pointer;font-size:12px;line-height:1;padding:0 4px;font-family:inherit}
.ms3d-close-btn:hover{color:var(--bl-text)}
.ms3d-panel-content{display:flex;flex-direction:column;gap:2px;padding:8px 0 10px}
.ms3d-input-row{display:flex;align-items:center;gap:8px;font-size:11px;padding:1px 10px}
.ms3d-input-row > span{flex:none;width:80px;color:var(--bl-dim)}
.ms3d-input-row input[type=number]{flex:1;min-width:0;border-radius:0;background:var(--bl-input);border:1px solid var(--bl-border);padding:4px 8px;color:var(--bl-text);font-size:11px;font-family:inherit}
.ms3d-timeline{bottom:0;left:0;right:0;width:auto;background:var(--bl-header);border-left:none;border-right:none;border-bottom:none}
.ms3d-tl-head{display:flex;align-items:center;gap:6px;padding:5px 12px;border-bottom:1px solid var(--bl-border)}
.ms3d-tl-spacer{margin-left:auto}
.ms3d-tl-label{color:var(--bl-dim);font-size:11px}
.ms3d-tl-stage{position:relative;height:34px;margin:6px 16px 10px}
.ms3d-track{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:4px;background:rgba(255,255,255,.16)}
.ms3d-playhead{position:absolute;top:0;bottom:0;width:2px;transform:translateX(-50%);background:var(--ms3d-accent,#fa7c1d)}
.ms3d-diamonds{position:absolute;inset:0}
.ms3d-diamond{position:absolute;top:50%;width:11px;height:11px;border:1px solid var(--bl-text);background:var(--bl-btn);cursor:pointer;padding:0;transform:translate(-50%,-50%) rotate(45deg)}
.ms3d-diamond:hover{background:var(--bl-btn-hover)}
.ms3d-diamond-active{background:var(--ms3d-accent,#fa7c1d);border-color:var(--ms3d-accent,#fa7c1d)}
.ms3d-modal{pointer-events:auto;position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.7);padding:24px}
.ms3d-modal.on{display:flex}
.ms3d-modal-card{width:100%;max-width:672px;background:var(--bl-panel);color:var(--bl-text);box-shadow:0 18px 40px rgba(0,0,0,.6)}
.ms3d-modal-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bl-header);border-bottom:1px solid var(--bl-border)}
.ms3d-modal-title{font-size:11px;font-weight:700;color:var(--bl-text);letter-spacing:.05em}
.ms3d-modal-close{background:none;border:none;color:var(--bl-dim);cursor:pointer;font-size:13px;font-family:inherit;padding:0}
.ms3d-modal-close:hover{color:var(--bl-text)}
.ms3d-textarea{width:calc(100% - 24px);height:256px;margin:12px 12px 0;border-radius:0;background:var(--bl-input);border:1px solid var(--bl-border);padding:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--bl-text);resize:vertical}
.ms3d-actions{display:flex;gap:8px;margin:12px;align-items:center}
.ms3d-err{font-size:11px;color:#f87171;align-self:center}
.ms3d-hidden{display:none!important}
.ms3d-help-modal-body{padding:14px 16px;font-size:11px;line-height:1.7;color:var(--bl-dim)}
.ms3d-help-modal-body b{color:var(--bl-text)}
.ms3d-light-icons{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.ms3d-light-icon{position:absolute;width:34px;height:34px;pointer-events:auto;cursor:pointer;line-height:0}
.ms3d-light-icon svg{width:100%;height:100%;fill:currentColor;filter:drop-shadow(0 2px 5px rgba(0,0,0,.5))}
.ms3d-light-icon:hover svg{filter:drop-shadow(0 0 8px currentColor)}
.ms3d-loader{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;z-index:5;pointer-events:none}
.ms3d-loader-spin{width:18px;height:18px;border-radius:9999px;border:2px solid rgba(255,255,255,.15);border-top-color:var(--ms3d-accent,#fa7c1d);animation:ms3d-spin .8s linear infinite}
@keyframes ms3d-spin{to{transform:rotate(360deg)}}
.ms3d-loader-bar-wrap{width:160px;height:3px;border-radius:9999px;background:rgba(255,255,255,.1);overflow:hidden}
.ms3d-loader-bar{height:100%;width:0%;background:var(--ms3d-accent,#fa7c1d);transition:width .15s ease}
.ms3d-loader-pct{font-size:11px;color:rgba(255,255,255,.8);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
`;

// The viewport camera object is a PerspectiveCamera that the author-mode
// editor swaps between perspective and orthographic projection by mutating the
// is*Camera flags and ortho frustum properties (see setOrthoView). EditorCamera
// models that: the PerspectiveCamera surface plus the ortho-specific members.
type EditorCamera = Omit<THREE.PerspectiveCamera, 'isPerspectiveCamera' | 'isOrthographicCamera'> & {
  isPerspectiveCamera: boolean;
  isOrthographicCamera: boolean;
  left: number; right: number; top: number; bottom: number;
};

interface LightKeyframe {
  pos: THREE.Vector3;
  intensity: number;
  color: string;
  angle: number;
  penumbra: number;
  distance: number;
  decay: number;
  target: THREE.Vector3;
}

interface Keyframe {
  t: number;
  modelPos: THREE.Vector3;
  modelRot: { x: number; y: number; z: number };
  envLight: number;
  envColor: string;
  camPos: THREE.Vector3 | null;
  camTarget: THREE.Vector3 | null;
  lights: Record<string, LightKeyframe>;
}

interface Snapshot {
  activeKf: number;
  env: { light: number; color: string };
  keyframes: Array<{
    t: number;
    modelPos: number[];
    modelRot: number[];
    cam: { pos: number[]; target: number[] } | null;
    envLight: number;
    envColor: string;
    lights: Record<string, { pos: number[]; intensity: number; color: string; angle: number; penumbra: number; distance: number; decay: number; target: number[] }>;
  }>;
  model: { pos: number[]; rot: number[]; scale: number[] };
  lights: Record<string, { pos: number[]; intensity: number; color: string; angle: number; penumbra: number; distance: number; decay: number; target: number[] }>;
}

interface ResolvedOptions {
  container: HTMLElement;
  canvas: HTMLCanvasElement | null;
  model: string;
  keyframes: string | object | unknown[] | null;
  editor: 'auto' | boolean;
  progressMode: 'scroll' | 'manual';
  accentColor: string;
  loader: boolean;
  disableOn: { mobile: boolean; reducedMotion: boolean };
  spin: boolean;
  camera: { fov: number; azimuthDeg: number; elevationDeg: number; fitPadding: number; mobileDistScale: number };
  environment: { light: number; color: string };
  lights: LightsOptions;
  onProgress: ((p: number) => void) | null;
  onLoad: (() => void) | null;
  onError: ((err: unknown) => void) | null;
  onSkip: ((reason: SkipReason) => void) | null;
  onExport: ((json: string) => void) | null;
}

export class ModelStory implements ModelStoryHandle {
  private three!: typeof import('three');
  private GLTFLoader!: typeof GLTFLoader;
  private RoomEnvironment!: typeof RoomEnvironment;
  private MeshoptDecoder!: typeof MeshoptDecoder;
  private TransformControls!: typeof TransformControls;

  private loadTimer: ReturnType<typeof setTimeout> | null = null;

  private opts!: ResolvedOptions;
  private state: 'idle' | 'loading' | 'ready' | 'error' | 'disposed' = 'idle';
  private editorEnabled = false;
  private editorRequested = false;
  private reduced = false;
  private isMobile = false;
  private madeContainerRelative = false;

  private canvas: HTMLCanvasElement | null = null;
  private autoCanvas: HTMLCanvasElement | null = null;
  private loaderEl: HTMLDivElement | null = null;
  private loaderBar: HTMLDivElement | null = null;
  private loaderPct: HTMLDivElement | null = null;

  private model: THREE.Object3D | null = null;
  private lightsMap: Record<string, THREE.SpotLight> = {};
  private scene: THREE.Scene | null = null;
  private camera: EditorCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private dist = 1;
  private baseAngle = 0;
  private camTarget: THREE.Vector3 | null = null;
  private fitRadius = 4;
  private groundY = 0;
  private lightHelpers: Record<string, THREE.SpotLightHelper> = {};
  private authorGrid: THREE.Group | null = null;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envLightness = 1;
  private envTint = '#ffffff';
  private lastEnvLight: number | null = null;
  private lastEnvColor: number | null = null;
  private c1: THREE.Color | null = null;
  private c2: THREE.Color | null = null;
  private c3: THREE.Color | null = null;

  private keyframes: Keyframe[] = [];
  private progress = 0;
  private inView = false;
  private rafId: number | null = null;
  private viewerInit = false;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;

  private editorReady = false;
  private editorOpen = false;
  private editorEl: HTMLDivElement | null = null;
  private selType: 'model' | 'camera' | 'key' | 'fill' | 'rim' = 'model';
  private activeKf = -1;
  private lerpEnabled = true;
  private isDragging = false;
  private gizmo: TransformControls | null = null;
  private gizmoSpace: 'world' | 'local' = 'world';
  private panelBody: HTMLDivElement | null = null;
  private playheadEl: HTMLDivElement | null = null;
  private diamondsEl: HTMLDivElement | null = null;
  private exportModal: HTMLDivElement | null = null;
  private exportText: HTMLTextAreaElement | null = null;
  private importModal: HTMLDivElement | null = null;
  private importText: HTMLTextAreaElement | null = null;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private initialSnapshot: Snapshot | null = null;
  private kfLightRotStart: { quat: THREE.Quaternion; offset: THREE.Vector3 } | null = null;
  private lightIcons: Record<string, HTMLDivElement> = {};
  private lightIconVec: THREE.Vector3 | null = null;
  private kfJumpGuard = false;
  private kfJumpGuardTimer: ReturnType<typeof setTimeout> | null = null;

  private freeNav = false;
  private navTarget: THREE.Vector3 | null = null;
  private navAz = 0;
  private navEl = 0;
  private navDist = 1;
  private navDrag: { mode: 'orbit' | 'pan' | 'zoom'; x: number; y: number; pointerId: number } | null = null;
  private navAttached = false;
  private navRight: THREE.Vector3 | null = null;
  private navUp: THREE.Vector3 | null = null;
  private navPose: THREE.Vector3 | null = null;
  private camFwd: THREE.Vector3 | null = null;
  private authoredCam: THREE.PerspectiveCamera | null = null;
  private camHelper: THREE.CameraHelper | null = null;
  private camLookTarget: THREE.Vector3 | null = null;
  private camEditDist = 1;
  private authoredCamSeeded = false;
  private camViewLock = false;
  private orthoView = false;
  private perspNear: number | null = null;
  private perspFar: number | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  private onScroll = (): void => {
    if (this.opts.progressMode !== 'scroll') return;
    this.updateProgress();
    this.applyProgress();
    this.applyAuthorPreview();
  };
  private onWinResize = (): void => { this.resize(); };

  // -------------------------------------------------------------------------
  // Entry point / bootstrap.
  // -------------------------------------------------------------------------

  static async create(options: ModelStoryOptions): Promise<ModelStoryHandle> {
    if (!options) throw new Error('ModelStory.create: options object is required');
    let container: HTMLElement | null = null;
    if (typeof options.container === 'string') {
      container = document.getElementById(options.container);
    } else {
      container = options.container as HTMLElement;
    }
    if (!container || !container.nodeType) throw new Error('ModelStory.create: options.container (Element) is required');
    if (typeof options.model !== 'string' || !options.model) throw new Error('ModelStory.create: options.model (URL string) is required');
    if (activeInstance) throw new Error('ModelStory.create: only one instance per page is supported; call handle.dispose() first');

    const instance = new ModelStory();
    activeInstance = instance;
    instance.editorRequested = false;
    instance.opts = instance.normalizeOptions(options);
    instance.opts.container = container;
    instance.editorEnabled = instance.opts.editor === 'auto' ? (new URLSearchParams(location.search).get('edit') === '1') : !!instance.opts.editor;
    instance.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    instance.isMobile = window.matchMedia('(hover: none)').matches || window.innerWidth < 768;

    const handle: ModelStoryHandle = instance;

    let skip: SkipReason | null = null;
    if (!instance.editorEnabled) {
      if (instance.opts.disableOn.reducedMotion && instance.reduced) skip = 'reduced-motion';
      else if (instance.opts.disableOn.mobile && instance.isMobile) skip = 'mobile';
    }
    if (!skip && !window.WebGLRenderingContext) skip = 'no-webgl';

    if (skip) {
      instance.state = 'idle';
      if (instance.opts.onSkip) instance.opts.onSkip(skip);
      return handle;
    }

    try {
      const mods = await loadThree();
      if (instance.state === 'disposed') return handle;
      instance.assignThree(mods);
      instance.state = 'ready';
      return handle;
    } catch (err) {
      instance.state = 'error';
      activeInstance = null;
      if (instance.opts.onError) instance.opts.onError(err);
      console.error('[ModelStory] Could not load three.js r160. Add an importmap to the host page manually mapping "three" to https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js and "three/addons/" to https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/, or ensure network access to the CDN.', err);
      throw err;
    }
  }

  private normalizeOptions(options: ModelStoryOptions): ResolvedOptions {
    return {
      container: options.container as HTMLElement,
      canvas: (options.canvas || null) as HTMLCanvasElement | null,
      model: options.model,
      keyframes: options.keyframes || null,
      editor: options.editor === undefined ? 'auto' : options.editor,
      progressMode: options.progressMode === 'manual' ? 'manual' : 'scroll',
      accentColor: options.accentColor || '#fa7c1d',
      loader: options.loader === undefined ? true : !!options.loader,
      disableOn: {
        mobile: !options.disableOn || options.disableOn.mobile === undefined ? true : !!options.disableOn.mobile,
        reducedMotion: !options.disableOn || options.disableOn.reducedMotion === undefined ? true : !!options.disableOn.reducedMotion
      },
      spin: options.spin === undefined ? true : !!options.spin,
      camera: {
        fov: (options.camera && options.camera.fov) || 40,
        azimuthDeg: (options.camera && options.camera.azimuthDeg) || 0,
        elevationDeg: (options.camera && options.camera.elevationDeg) || 9,
        fitPadding: (options.camera && options.camera.fitPadding) || 1.06,
        mobileDistScale: (options.camera && options.camera.mobileDistScale) || 1.8
      },
      environment: {
        light: (options.environment && typeof options.environment.light === 'number') ? options.environment.light : 1,
        color: (options.environment && options.environment.color) || '#000000'
      },
      lights: options.lights || {},
      onProgress: typeof options.onProgress === 'function' ? options.onProgress : null,
      onLoad: typeof options.onLoad === 'function' ? options.onLoad : null,
      onError: typeof options.onError === 'function' ? options.onError : null,
      onSkip: typeof options.onSkip === 'function' ? options.onSkip : null,
      onExport: typeof options.onExport === 'function' ? options.onExport : null
    };
  }

  // Wire the loaded three modules into the instance and bootstrap the viewer.
  // Shared by create() and startBootstrap().
  private assignThree(mods: ThreeModules): void {
    this.three = mods.THREE;
    this.GLTFLoader = mods.GLTFLoader;
    this.RoomEnvironment = mods.RoomEnvironment;
    this.MeshoptDecoder = mods.MeshoptDecoder;
    this.TransformControls = mods.TransformControls;
    this.baseAngle = this.three.MathUtils.degToRad(50);
    this.camTarget = new this.three.Vector3();
    this.c1 = new this.three.Color();
    this.c2 = new this.three.Color();
    this.c3 = new this.three.Color();
    this.setup();
  }

  private async startBootstrap(): Promise<void> {
    this.state = 'loading';
    try {
      const mods = await loadThree();
      if ((this.state as string) === 'disposed') return;
      this.assignThree(mods);
      this.state = 'ready';
    } catch (err) {
      if ((this.state as string) === 'disposed') return;
      this.state = 'error';
      if (this.opts.onError) this.opts.onError(err);
      console.error('[ModelStory] Could not load three.js r160. Add an importmap to the host page manually mapping "three" to https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js and "three/addons/" to https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/ (or restore network access to jsdelivr), then retry.', err);
    }
  }

  // -------------------------------------------------------------------------
  // Setup: style + canvas inside the caller's container, IntersectionObserver
  // loop control (rootMargin '250px 0px', like source), scroll driver.
  // -------------------------------------------------------------------------
  private setup(): void {
    this.ensureStyle();
    const cs = window.getComputedStyle(this.opts.container);
    if (cs.position === 'static') {
      this.opts.container.style.position = 'relative';
      this.madeContainerRelative = true;
    }

    if (this.opts.canvas) {
      this.canvas = this.opts.canvas;
    } else {
      const cv = document.createElement('canvas');
      cv.style.position = 'absolute';
      cv.style.inset = '0';
      cv.style.display = 'block';
      cv.style.setProperty('width', '100%', 'important');
      cv.style.setProperty('height', '100%', 'important');
      this.opts.container.appendChild(cv);
      this.canvas = cv;
      this.autoCanvas = cv;
    }

    this.io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        this.inView = e.isIntersecting;
        if (this.inView && this.viewerInit && this.scene) this.startLoop();
        else if (!this.inView) this.stopLoop();
        if (this.inView && !this.viewerInit) this.initViewer();
      });
    }, { rootMargin: '250px 0px' });
    this.io.observe(this.opts.container);

    if (this.opts.progressMode === 'scroll') {
      window.addEventListener('scroll', this.onScroll, { passive: true });
    }

    const r = this.opts.container.getBoundingClientRect();
    if ((r.bottom > 0 && r.top < window.innerHeight) || this.editorEnabled || this.editorRequested) {
      this.inView = true;
      this.initViewer();
    }
    this.applyProgress();
  }

  // -------------------------------------------------------------------------
  // Viewer init (source initViewer): renderer, PMREM RoomEnvironment, 3 spotlights,
  // GLTF load with meshopt, sizing to canvas.clientWidth/Height.
  // -------------------------------------------------------------------------
  private initViewer(): void {
    if (this.viewerInit) return;
    this.viewerInit = true;
    if (!window.WebGLRenderingContext) return;

    this.loadKeyframes();
    this.showLoading();

    try {
      this.renderer = new this.three.WebGLRenderer({ canvas: this.canvas!, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    } catch (e) {
      this.hideLoading();
      if (this.opts.onError) this.opts.onError(e);
      console.error('[ModelStory] WebGL context creation failed', e);
      return;
    }
    const renderer = this.renderer;
    renderer.outputColorSpace = this.three.SRGBColorSpace;
    renderer.toneMapping = this.three.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = this.three.PCFShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.25 : 2));

    const scene = new this.three.Scene();
    scene.background = null;
    this.scene = scene;
    this.pmrem = new this.three.PMREMGenerator(renderer);
    this.envLightness = this.opts.environment.light;
    this.envTint = this.opts.environment.color;
    this.applyEnvironment();

    this.camera = new this.three.PerspectiveCamera(this.opts.camera.fov, 1, 0.1, 200) as EditorCamera;
    this.resize();

    const lightDefs = [
      { name: 'key', color: 0xfff1e0, intensity: 1.7, position: [5, 9, 4], angleDeg: 38, penumbra: 0.3, distance: 0, decay: 1.5 },
      { name: 'fill', color: 0x9db8ff, intensity: 0.45, position: [-6, 5, -6], angleDeg: 42, penumbra: 0.4, distance: 0, decay: 1.5 },
      { name: 'rim', color: 0xffb877, intensity: 0.5, position: [-3, 2, -8], angleDeg: 40, penumbra: 0.35, distance: 0, decay: 1.5 }
    ] as const;
    lightDefs.forEach((d) => {
      const o: LightsOptions['key'] = this.opts.lights[d.name] || {};
      const color = o.color !== undefined ? o.color : d.color;
      const intensity = o.intensity !== undefined ? o.intensity : d.intensity;
      const L = new this.three.SpotLight(color, intensity);
      const pos = o.position || d.position;
      L.position.set(pos[0], pos[1], pos[2]);
      L.name = d.name;
      L.castShadow = true;
      L.shadow.radius = 3;
      L.shadow.bias = -0.0003;
      L.shadow.normalBias = 0.03;
      L.angle = this.three.MathUtils.degToRad(o.angleDeg !== undefined ? o.angleDeg : d.angleDeg);
      L.penumbra = o.penumbra !== undefined ? o.penumbra : d.penumbra;
      L.distance = o.distance !== undefined ? o.distance : d.distance;
      L.decay = o.decay !== undefined ? o.decay : d.decay;
      this.lightsMap[d.name] = L;
      scene.add(L);
      L.target = new this.three.Object3D();
      scene.add(L.target);
    });

    const gltfLoader = new this.GLTFLoader();
    gltfLoader.setMeshoptDecoder(this.MeshoptDecoder);
    gltfLoader.load(this.opts.model, (gltf) => this.onModelLoaded(gltf), (xhr) => this.onLoadProgress(xhr), (err) => this.onLoadError(err));

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => { this.resize(); });
      this.ro.observe(this.canvas!);
    } else {
      window.addEventListener('resize', this.onWinResize);
    }
  }

  private onModelLoaded(gltf: GLTF): void {
    const model = gltf.scene;
    this.model = model;
    const scene = this.scene!;
    scene.add(model);

    const box = new this.three.Box3().setFromObject(model);
    const center = box.getCenter(new this.three.Vector3());
    const size = box.getSize(new this.three.Vector3());
    model.position.sub(center);

    const sphere = box.getBoundingSphere(new this.three.Sphere());
    this.groundY = box.min.y - center.y;
    this.fitRadius = sphere.radius;

    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    (['key', 'fill', 'rim'] as const).forEach((n) => {
      const L = this.lightsMap[n];
      L.shadow.mapSize.set(1024, 1024);
      this.refreshLightShadow(L);
    });

    const camera = this.camera!;
    const vfov = this.three.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const fov = Math.min(vfov, hfov);
    this.dist = (sphere.radius / Math.tan(fov / 2)) * this.opts.camera.fitPadding;
    if (this.isMobile) this.dist *= this.opts.camera.mobileDistScale;

    camera.near = this.dist / 60;
    camera.far = this.dist * 25;
    camera.updateProjectionMatrix();

    if (this.camTarget) this.camTarget.set(0, -size.y * 0.42, 0);
    this.resize();
    if (this.keyframes.length) {
      const ks = this.sampleKeyframes(this.progress);
      if (ks) this.applyKfState(ks);
    }
    this.applyProgress();
    this.hideLoading();
    if (this.opts.onLoad) this.opts.onLoad();
    if (this.inView) this.startLoop();
    if (this.editorEnabled || this.editorRequested) this.initEditor();
  }

  private onLoadProgress(xhr: ProgressEvent): void {
    if (!this.loaderBar) return;
    const total = xhr.total || 1;
    const pct = Math.min(100, Math.round((xhr.loaded / total) * 100));
    this.loaderBar.style.width = pct + '%';
    if (this.loaderPct) this.loaderPct.textContent = Math.min(pct, 99) + '%';
  }

  private onLoadError(err: unknown): void {
    this.hideLoading();
    if (this.opts.onError) this.opts.onError(err);
    console.error('[ModelStory] model load failed', err);
  }

  // -------------------------------------------------------------------------
  // Built-in loader overlay (inside container, centered at bottom).
  // -------------------------------------------------------------------------
  private showLoading(): void {
    if (!this.opts.loader) return;
    if (!this.loaderEl) {
      this.loaderEl = document.createElement('div');
      this.loaderEl.className = 'ms3d-loader';
      this.loaderEl.style.setProperty('--ms3d-accent', this.opts.accentColor);
      this.loaderEl.innerHTML = '<div class="ms3d-loader-spin"></div><div class="ms3d-loader-bar-wrap"><div class="ms3d-loader-bar"></div></div><div class="ms3d-loader-pct">0%</div>';
      this.opts.container.appendChild(this.loaderEl);
      this.loaderBar = this.loaderEl.querySelector('.ms3d-loader-bar') as HTMLDivElement;
      this.loaderPct = this.loaderEl.querySelector('.ms3d-loader-pct') as HTMLDivElement;
    }
    this.loaderEl.style.display = 'flex';
    clearTimeout(this.loadTimer!);
    this.loadTimer = setTimeout(() => { this.hideLoading(); }, LOAD_TIMEOUT);
  }

  private hideLoading(): void {
    clearTimeout(this.loadTimer!);
    if (this.loaderEl) this.loaderEl.style.display = 'none';
  }

  // -------------------------------------------------------------------------
  // Sizing: renderer + camera aspect tracked from the canvas element itself
  // (ResizeObserver on canvas, window-resize fallback) — embeds may not be
  // full-viewport, unlike the source.
  // -------------------------------------------------------------------------
  private resize(): void {
    const camera = this.camera;
    const renderer = this.renderer;
    if (!camera || !renderer) return;
    const w = (this.canvas && this.canvas.clientWidth) || 1;
    const h = (this.canvas && this.canvas.clientHeight) || 1;
    camera.aspect = w / h;
    if (this.orthoView) this.applyOrthoProjection();
    else camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    // Helper mirrors the authored pose; only refresh it when the main camera
    // is at that pose (outside freeNav), otherwise it stays as-is until the
    // next authored-framing frame.
    if (this.camHelper && !this.freeNav) this.syncCamHelper();
  }

  // -------------------------------------------------------------------------
  // Progress: scroll math identical to source (p = -rect.top / (height - innerHeight)).
  // -------------------------------------------------------------------------
  private updateProgress(): void {
    if (this.opts.progressMode !== 'scroll') return;
    const rect = this.opts.container.getBoundingClientRect();
    const total = this.opts.container.offsetHeight - window.innerHeight;
    if (total <= 0) { this.progress = 0; return; }
    const p = -rect.top / total;
    this.progress = Math.max(0, Math.min(1, p));
  }

  private applyProgress(): void {
    const now = performance.now();
    const model = this.model;
    const camera = this.camera;
    const camTarget = this.camTarget;

    if (model && !this.editorOpen) {
      if (this.keyframes.length) {
        const ks = this.sampleKeyframes(this.progress);
        if (ks) this.applyKfState(ks);
      } else if (!this.reduced && this.opts.spin) {
        const spinT = this.smoothstep(0.26, 0.92, this.progress);
        const sway = (this.progress < 0.22) ? Math.sin(now * 0.0011) * 0.06 : 0;
        model.rotation.y = this.baseAngle + spinT * Math.PI * 2 + sway;
      } else {
        model.rotation.y = this.baseAngle;
      }
    }

    if (this.editorEl && this.editorOpen) this.updatePlayhead();

    if (camera && camTarget) {
      // Camera framing. A keyframe can pin a camera pose (camPos + camTarget);
      // between two such keyframes the camera is interpolated. Keyframes without
      // a camera pose (and segments adjacent to them) fall back to the fixed
      // authored framing. While the author-mode viewport is in free navigation
      // the camera follows the transient nav state instead — that view is only
      // captured into a keyframe when Camera is selected and K is pressed.
      if (this.freeNav && this.navTarget) {
        this.applyNavCamera();
      } else if (!this.freeNav) {
        let camKf: Keyframe | null = null;
        if (this.keyframes.length) {
          const ks = this.sampleKeyframes(this.progress);
          if (ks && ks.camPos && ks.camTarget) camKf = ks;
        }
        if (camKf && camKf.camPos && camKf.camTarget) {
          camera.position.copy(camKf.camPos);
          camera.lookAt(camKf.camTarget);
          if (this.camLookTarget) this.camLookTarget.copy(camKf.camTarget);
        } else {
          const az = this.three.MathUtils.degToRad(this.opts.camera.azimuthDeg);
          const el = this.three.MathUtils.degToRad(this.opts.camera.elevationDeg);
          let dolly = 1;
          if (!(this.keyframes.length && model) && this.progress > 0.84) {
            dolly = 1 - 0.1 * ((this.progress - 0.84) / 0.16);
          }
          camera.position.set(
            camTarget.x + Math.sin(az) * Math.cos(el) * this.dist * dolly,
            camTarget.y + Math.sin(el) * this.dist * dolly,
            camTarget.z + Math.cos(az) * Math.cos(el) * this.dist * dolly
          );
          camera.lookAt(camTarget);
          if (this.camLookTarget) this.camLookTarget.copy(camTarget);
        }
        if (this.orthoView) this.applyOrthoProjection();
        if (this.camHelper) this.syncCamHelper();
      }
    }

    // Blender-style camera visual: while freely navigating, a wireframe shows
    // where the authored camera sits; hidden when looking through it.
    if (this.camHelper) this.camHelper.visible = this.freeNav;

    if (this.editorOpen) this.updateLightIcons();

    if (this.opts.onProgress) this.opts.onProgress(this.progress);
  }

  private animate(): void {
    this.updateProgress();
    this.applyProgress();
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(() => this.animate());
  }

  private startLoop(): void {
    if (this.rafId == null) this.animate();
  }

  private stopLoop(): void {
    if (this.rafId != null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  // Injected once into document.head as #ms3d-styles; reference-counted via the
  // module-level styleUsers counter (incremented here, decremented in dispose()).
  private ensureStyle(): void {
    if (!document.getElementById('ms3d-styles')) {
      const s = document.createElement('style');
      s.id = 'ms3d-styles';
      s.textContent = STYLE_CSS;
      document.head.appendChild(s);
    }
    styleUsers += 1;
  }

  // -------------------------------------------------------------------------
  // Environment (PMREM RoomEnvironment with quantized caching) + light shadows.
  // -------------------------------------------------------------------------
  private quantEnvColor(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) / 16);
    const g = Math.round(((n >> 8) & 255) / 16);
    const b = Math.round((n & 255) / 16);
    return (r << 8) | (g << 4) | b;
  }

  private applyEnvironment(): void {
    if (!this.pmrem) return;
    const q = Math.round(this.envLightness * 50);
    const qc = this.quantEnvColor(this.envTint);
    if (this.lastEnvLight === q && this.lastEnvColor === qc) return;
    this.lastEnvLight = q;
    this.lastEnvColor = qc;
    const tint = new this.three.Color(this.envTint);
    const env = new this.RoomEnvironment();
    env.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (m && m.color) m.color.multiplyScalar(this.envLightness).multiply(tint);
      }
      const pl = o as THREE.PointLight;
      if (pl.isPointLight) { pl.intensity *= this.envLightness; pl.color.copy(tint); }
    });
    const newEnv = this.pmrem!.fromScene(env, 0.04).texture;
    const scene = this.scene;
    if (scene) {
      if (scene.environment) scene.environment.dispose();
      scene.environment = newEnv;
    }
    env.dispose();
  }

  private syncEnvControls(): void {
    const sl = document.getElementById('ms3d-env-light') as HTMLInputElement | null;
    const val = document.getElementById('ms3d-env-light-val') as HTMLInputElement | null;
    const col = document.getElementById('ms3d-env-color') as HTMLInputElement | null;
    if (sl) sl.value = String(Math.round(this.envLightness * 100) / 100);
    if (val) val.value = String(Math.round(this.envLightness * 1000) / 1000);
    if (col) col.value = this.envTint;
  }

  private refreshLightShadow(L: THREE.SpotLight): void {
    if (!L || !L.shadow || !this.fitRadius) return;
    L.angle = this.three.MathUtils.clamp(L.angle, 0.01, this.three.MathUtils.degToRad(85));
    const cam = L.shadow.camera;
    const tgt = L.target || L;
    const d = L.position.distanceTo(tgt.position);
    const far = L.distance > 0 ? Math.min(L.distance + this.fitRadius, d + this.fitRadius * 4) : d + this.fitRadius * 4;
    cam.near = Math.max(0.05, Math.min(d, far) - this.fitRadius * 2);
    cam.far = Math.max(cam.near + 1, far);
    cam.fov = Math.min(170, this.three.MathUtils.radToDeg(L.angle) * 2);
    cam.updateProjectionMatrix();
  }

  // -------------------------------------------------------------------------
  // Keyframe engine (ported verbatim, truck* renamed to model* semantics).
  // -------------------------------------------------------------------------
  private smoothstep(a: number, b: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  private kfLerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private kfLerp3(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
    out.x = this.kfLerp(a.x, b.x, t);
    out.y = this.kfLerp(a.y, b.y, t);
    out.z = this.kfLerp(a.z, b.z, t);
    return out;
  }

  private kfLerpColor(ha: string, hb: string, t: number): string {
    this.c1!.set(ha); this.c2!.set(hb); this.c3!.copy(this.c1!).lerp(this.c2!, t);
    return '#' + this.c3!.getHexString();
  }

  private sampleKeyframes(p: number): Keyframe | null {
    if (!this.keyframes.length) return null;
    if (p <= this.keyframes[0].t) return this.keyframes[0];
    const last = this.keyframes[this.keyframes.length - 1];
    if (p >= last.t) return last;
    for (let i = 0; i < this.keyframes.length - 1; i++) {
      const a = this.keyframes[i], b = this.keyframes[i + 1];
      if (p >= a.t && p <= b.t) {
        if (!this.lerpEnabled) return p >= b.t ? b : a;
        const span = b.t - a.t;
        const f = span === 0 ? 0 : (p - a.t) / span;
        return this.blendKeyframes(a, b, f);
      }
    }
    return last;
  }

  private blendKeyframes(a: Keyframe, b: Keyframe, f: number): Keyframe {
    const al = typeof a.envLight === 'number' ? a.envLight : 1;
    const bl = typeof b.envLight === 'number' ? b.envLight : 1;
    const out: Keyframe = {
      // The interface requires t; the blend is the interpolated pose at f, so
      // carry the interpolated time (unused by callers, like the source).
      t: this.kfLerp(a.t, b.t, f),
      modelPos: this.kfLerp3(a.modelPos, b.modelPos, f, new this.three.Vector3()),
      modelRot: { x: this.kfLerp(a.modelRot.x, b.modelRot.x, f), y: this.kfLerp(a.modelRot.y, b.modelRot.y, f), z: this.kfLerp(a.modelRot.z, b.modelRot.z, f) },
      envLight: this.kfLerp(al, bl, f),
      envColor: this.kfLerpColor(a.envColor || '#ffffff', b.envColor || '#ffffff', f),
      camPos: null,
      camTarget: null,
      lights: {}
    };
    // Camera pose is only interpolated when BOTH endpoints pin one; a segment
    // with a missing camera falls back to the authored framing.
    if (a.camPos && b.camPos && a.camTarget && b.camTarget) {
      out.camPos = this.kfLerp3(a.camPos, b.camPos, f, new this.three.Vector3());
      out.camTarget = this.kfLerp3(a.camTarget, b.camTarget, f, new this.three.Vector3());
    }
    for (const n in a.lights) {
      const la = a.lights[n], lb = b.lights[n];
      if (!lb) continue;
      out.lights[n] = {
        pos: this.kfLerp3(la.pos, lb.pos, f, new this.three.Vector3()),
        intensity: this.kfLerp(la.intensity, lb.intensity, f),
        color: this.kfLerpColor(la.color, lb.color, f),
        angle: this.kfLerp(la.angle, lb.angle, f),
        penumbra: this.kfLerp(la.penumbra, lb.penumbra, f),
        distance: this.kfLerp(la.distance, lb.distance, f),
        decay: this.kfLerp(la.decay, lb.decay, f),
        target: this.kfLerp3(la.target, lb.target, f, new this.three.Vector3())
      };
    }
    return out;
  }

  private applyKfState(s: Keyframe): void {
    const model = this.model;
    if (!model) return;
    model.position.copy(s.modelPos);
    model.rotation.set(s.modelRot.x, s.modelRot.y, s.modelRot.z);
    if (typeof s.envLight === 'number') this.envLightness = s.envLight;
    if (s.envColor) this.envTint = s.envColor;
    this.applyEnvironment();
    for (const n in s.lights) {
      const L = this.lightsMap[n];
      if (!L) continue;
      const d = s.lights[n];
      L.position.copy(d.pos);
      L.intensity = d.intensity;
      L.color.set(d.color);
      L.angle = d.angle;
      L.penumbra = d.penumbra;
      L.distance = d.distance;
      L.decay = d.decay;
      if (L.target) L.target.position.copy(d.target || s.modelPos);
      this.refreshLightShadow(L);
    }
    // Stored camera pose, applied only when the author is not actively
    // navigating — otherwise the transient viewport camera would be clobbered
    // the moment keyframe state is scrubbed or captured.
    const camera = this.camera;
    if (camera && s.camPos && s.camTarget && !(this.editorOpen && this.freeNav)) {
      camera.position.copy(s.camPos);
      camera.lookAt(s.camTarget);
      if (this.camLookTarget) this.camLookTarget.copy(s.camTarget);
    }
  }

  // -------------------------------------------------------------------------
  // Keyframe JSON: load from URL / inline object / plain array; accept both
  // modelPos/truckPos (modelPos wins); exporter emits both keys per keyframe.
  // -------------------------------------------------------------------------
  private parseKeyframesList(list: any[], onErr?: (msg: string) => void): Keyframe[] | null {
    const out: Keyframe[] = [];
    for (let i = 0; i < list.length; i++) {
      const k = list[i] as any;
      if (!k || typeof k.t !== 'number') { if (onErr) onErr('Keyframe ' + i + ' has no numeric t'); return null; }
      const pos = k.modelPos || k.truckPos || {};
      const rot = k.modelRot || k.truckRot || {};
      const kf: Keyframe = {
        t: k.t,
        modelPos: new this.three.Vector3(pos.x || 0, pos.y || 0, pos.z || 0),
        modelRot: { x: rot.x || 0, y: rot.y || 0, z: rot.z || 0 },
        envLight: typeof k.envLight === 'number' ? k.envLight : 1,
        envColor: k.envColor || '#ffffff',
        camPos: null,
        camTarget: null,
        lights: {}
      };
      // Optional camera pose; only honored when BOTH keys are present so a
      // keyframe never pins a half-defined camera.
      if (k.camPos && k.camTarget) {
        kf.camPos = new this.three.Vector3(k.camPos.x || 0, k.camPos.y || 0, k.camPos.z || 0);
        kf.camTarget = new this.three.Vector3(k.camTarget.x || 0, k.camTarget.y || 0, k.camTarget.z || 0);
      }
      for (const n in (k.lights || {})) {
        const l = k.lights[n] || {};
        const lp = l.pos || {};
        const lt = l.target ? { x: l.target.x || 0, y: l.target.y || 0, z: l.target.z || 0 } : (pos.x !== undefined ? { x: pos.x || 0, y: pos.y || 0, z: pos.z || 0 } : { x: 0, y: 0, z: 0 });
        kf.lights[n] = {
          pos: new this.three.Vector3(lp.x || 0, lp.y || 0, lp.z || 0),
          intensity: typeof l.intensity === 'number' ? l.intensity : 0,
          color: l.color || '#ffffff',
          angle: typeof l.angle === 'number' ? l.angle : this.three.MathUtils.degToRad(38),
          penumbra: typeof l.penumbra === 'number' ? l.penumbra : 0.3,
          distance: typeof l.distance === 'number' ? l.distance : 0,
          decay: typeof l.decay === 'number' ? l.decay : 1.5,
          target: new this.three.Vector3(lt.x || 0, lt.y || 0, lt.z || 0)
        };
      }
      out.push(kf);
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  private applyEnvFromData(data: any): void {
    if (!data || !data.env) return;
    if (typeof data.env.light === 'number') this.envLightness = data.env.light;
    if (data.env.color) this.envTint = data.env.color;
    this.applyEnvironment();
  }

  private handleKfData(data: any): void {
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.keyframes) ? data.keyframes : null);
    if (!list || !list.length) return;
    const out = this.parseKeyframesList(list);
    if (!out) return;
    this.applyEnvFromData(data);
    this.keyframes.length = 0;
    out.forEach((kf) => { this.keyframes.push(kf); });
    if (this.model) {
      const ks = this.sampleKeyframes(this.progress);
      if (ks) this.applyKfState(ks);
    }
    this.renderDiamonds();
    this.updatePlayhead();
    this.updatePanel();
    this.applyProgress();
    // Keyframes may finish loading after the editor already opened; fill the
    // selection then too (no-op outside the editor or if one is active).
    this.ensureInitialKeyframeSelected();
  }

  private loadKeyframes(): void {
    if (!this.opts.keyframes) return;
    if (typeof this.opts.keyframes === 'string') {
      fetch(this.opts.keyframes)
        .then((r) => r.json())
        .then((data) => this.handleKfData(data))
        .catch(() => {});
    } else {
      this.handleKfData(this.opts.keyframes);
    }
  }

  private getExportJSON(): string {
    return JSON.stringify({
      version: 1,
      env: { light: this.envLightness, color: this.envTint },
      keyframes: this.keyframes.map((k) => {
        const kf: any = {
          t: k.t,
          modelPos: { x: k.modelPos.x, y: k.modelPos.y, z: k.modelPos.z },
          modelRot: { x: k.modelRot.x, y: k.modelRot.y, z: k.modelRot.z },
          truckPos: { x: k.modelPos.x, y: k.modelPos.y, z: k.modelPos.z },
          truckRot: { x: k.modelRot.x, y: k.modelRot.y, z: k.modelRot.z },
          envLight: k.envLight,
          envColor: k.envColor,
          lights: {}
        };
        if (k.camPos && k.camTarget) {
          kf.camPos = { x: k.camPos.x, y: k.camPos.y, z: k.camPos.z };
          kf.camTarget = { x: k.camTarget.x, y: k.camTarget.y, z: k.camTarget.z };
        }
        Object.keys(k.lights).forEach((n) => {
          const l = k.lights[n];
          kf.lights[n] = {
            pos: { x: l.pos.x, y: l.pos.y, z: l.pos.z },
            intensity: l.intensity,
            color: l.color,
            angle: l.angle,
            penumbra: l.penumbra,
            distance: l.distance,
            decay: l.decay,
            target: { x: l.target.x, y: l.target.y, z: l.target.z }
          };
        });
        return kf;
      })
    }, null, 2);
  }

  // -------------------------------------------------------------------------
  // Undo / Redo: 60-deep stacks, full-state snapshots.
  // -------------------------------------------------------------------------
  private snapshot(): Snapshot {
    const m = this.model!;
    return {
      activeKf: this.activeKf,
      env: { light: this.envLightness, color: this.envTint },
      keyframes: this.keyframes.map((k) => {
        return {
          t: k.t,
          modelPos: [k.modelPos.x, k.modelPos.y, k.modelPos.z],
          modelRot: [k.modelRot.x, k.modelRot.y, k.modelRot.z],
          cam: (k.camPos && k.camTarget) ? { pos: [k.camPos.x, k.camPos.y, k.camPos.z], target: [k.camTarget.x, k.camTarget.y, k.camTarget.z] } : null,
          envLight: k.envLight,
          envColor: k.envColor,
          lights: Object.keys(k.lights).reduce((o, n) => {
            const l = k.lights[n];
            o[n] = { pos: [l.pos.x, l.pos.y, l.pos.z], intensity: l.intensity, color: l.color, angle: l.angle, penumbra: l.penumbra, distance: l.distance, decay: l.decay, target: [l.target.x, l.target.y, l.target.z] };
            return o;
          }, {} as Snapshot['keyframes'][number]['lights'])
        };
      }),
      model: { pos: [m.position.x, m.position.y, m.position.z], rot: [m.rotation.x, m.rotation.y, m.rotation.z], scale: [m.scale.x, m.scale.y, m.scale.z] },
      lights: Object.keys(this.lightsMap).reduce((o, n) => {
        const L = this.lightsMap[n];
        o[n] = { pos: [L.position.x, L.position.y, L.position.z], intensity: L.intensity, color: '#' + L.color.getHexString(), angle: L.angle, penumbra: L.penumbra, distance: L.distance, decay: L.decay, target: [L.target.position.x, L.target.position.y, L.target.position.z] };
        return o;
      }, {} as Snapshot['lights'])
    };
  }

  private restoreSnapshot(s: Snapshot): void {
    this.keyframes.length = 0;
    s.keyframes.forEach((k) => {
      const kf: Keyframe = {
        t: k.t,
        modelPos: new this.three.Vector3().fromArray(k.modelPos),
        modelRot: { x: k.modelRot[0], y: k.modelRot[1], z: k.modelRot[2] },
        envLight: typeof k.envLight === 'number' ? k.envLight : 1,
        envColor: k.envColor || '#ffffff',
        camPos: null,
        camTarget: null,
        lights: {}
      };
      if (k.cam && k.cam.pos && k.cam.target) {
        kf.camPos = new this.three.Vector3().fromArray(k.cam.pos);
        kf.camTarget = new this.three.Vector3().fromArray(k.cam.target);
      }
      for (const n in k.lights) {
        const l = k.lights[n];
        kf.lights[n] = {
          pos: new this.three.Vector3().fromArray(l.pos),
          intensity: l.intensity,
          color: l.color,
          angle: typeof l.angle === 'number' ? l.angle : this.three.MathUtils.degToRad(38),
          penumbra: typeof l.penumbra === 'number' ? l.penumbra : 0.3,
          distance: typeof l.distance === 'number' ? l.distance : 0,
          decay: typeof l.decay === 'number' ? l.decay : 1.5,
          target: new this.three.Vector3().fromArray(l.target || l.pos)
        };
      }
      this.keyframes.push(kf);
    });
    const m = this.model!;
    m.position.fromArray(s.model.pos);
    m.rotation.fromArray(s.model.rot as [number, number, number]);
    m.scale.fromArray(s.model.scale);
    for (const n in s.lights) {
      const L = this.lightsMap[n];
      if (!L) continue;
      const sl = s.lights[n];
      L.position.fromArray(sl.pos);
      L.intensity = sl.intensity;
      L.color.set(sl.color);
      L.angle = sl.angle;
      L.penumbra = sl.penumbra;
      L.distance = sl.distance;
      L.decay = sl.decay;
      if (L.target && sl.target) L.target.position.fromArray(sl.target);
      this.refreshLightShadow(L);
    }
    this.activeKf = s.activeKf !== undefined && s.activeKf < this.keyframes.length ? s.activeKf : -1;
    if (s.env) {
      if (typeof s.env.light === 'number') this.envLightness = s.env.light;
      if (s.env.color) this.envTint = s.env.color;
    }
    this.applyEnvironment();
    this.renderDiamonds();
    this.updatePanel();
    this.updatePlayhead();
    this.syncEnvControls();
  }

  private pushUndo(): void {
    if (!this.model) return;
    this.undoStack.push(this.snapshot());
    this.redoStack.length = 0;
    if (this.undoStack.length > 60) this.undoStack.shift();
  }

  private undo(): void {
    if (!this.model || !this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.restoreSnapshot(this.undoStack.pop()!);
  }

  private redo(): void {
    if (!this.model || !this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restoreSnapshot(this.redoStack.pop()!);
  }

  private resetSelection(): void {
    if (!this.initialSnapshot || !this.model) return;
    const m = this.model;
    this.pushUndo();
    const s = this.initialSnapshot;
    if (this.selType === 'model') {
      m.position.fromArray(s.model.pos);
      m.rotation.fromArray(s.model.rot as [number, number, number]);
      m.scale.fromArray(s.model.scale);
    } else if (this.selType === 'camera') {
      // Explicit Reset always re-seeds the editable camera from the viewport
      // (snapshot() stores no top-level camera pose), hence force = true.
      this.seedAuthoredCam(true);
      if (this.camHelper) this.updateCamHelperFromAuthored();
      this.seedNavFromAuthoredCam();
      this.freeNav = true;
      this.camViewLock = false;
      this.applyProgress();
    } else if (s.lights[this.selType]) {
      const L = this.lightsMap[this.selType];
      const sl = s.lights[this.selType];
      L.position.fromArray(sl.pos);
      L.intensity = sl.intensity;
      L.color.set(sl.color);
      L.angle = sl.angle;
      L.penumbra = sl.penumbra;
      L.distance = sl.distance;
      L.decay = sl.decay;
      if (L.target && sl.target) L.target.position.fromArray(sl.target);
      this.refreshLightShadow(L);
    }
    if (this.activeKf >= 0) this.updateActiveKeyframe();
    this.updatePanel();
  }

  // -------------------------------------------------------------------------
  // Public handle API.
  // -------------------------------------------------------------------------
  public setProgress(p: number): void {
    if (this.state === 'disposed') return;
    this.progress = Math.max(0, Math.min(1, typeof p === 'number' && isFinite(p) ? p : 0));
    this.applyProgress();
  }

  public getProgress(): number {
    return this.progress;
  }

  public play(): void {
    this.startLoop();
  }

  public pause(): void {
    this.stopLoop();
  }

  public exportJSON(): string {
    return this.getExportJSON();
  }

  public importJSON(str: string): boolean {
    if (this.state === 'disposed' || typeof str !== 'string') return false;
    let data: any;
    try {
      data = JSON.parse(str);
    } catch (e) {
      return false;
    }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.keyframes) ? data.keyframes : null);
    if (!list) return false;
    const out = this.parseKeyframesList(list);
    if (!out) return false;
    this.pushUndo();
    this.applyEnvFromData(data);
    this.keyframes.length = 0;
    out.forEach((kf) => { this.keyframes.push(kf); });
    this.activeKf = -1;
    this.renderDiamonds();
    this.updatePlayhead();
    this.updatePanel();
    this.syncEnvControls();
    return true;
  }

  // -------------------------------------------------------------------------
  // Author-mode viewport navigation (Blender-style). While freeNav is true the
  // camera follows the transient nav state below instead of the authored
  // framing; Numpad 0 (see onKey) and leaving author mode snap it back.
  // -------------------------------------------------------------------------
  private resetNavState(): void {
    this.freeNav = false;
    this.camViewLock = false;
    this.navDrag = null;
    if (this.camera && this.camTarget && this.navTarget) {
      // Prefer the active keyframe's stored camera pose; otherwise fall back to
      // the fixed authored framing. This is what Numpad 0 and editor exit snap
      // back to, and what Camera selection seeds the navigation from.
      const pose = (this.activeKf >= 0 && this.keyframes[this.activeKf] && this.keyframes[this.activeKf].camPos) ? this.keyframes[this.activeKf] : null;
      if (pose && this.navPose) {
        const cp = pose.camPos!;
        const ct = pose.camTarget!;
        this.navTarget.copy(ct);
        this.navPose.subVectors(cp, ct);
        this.navDist = Math.max(this.navPose.length(), 0.001);
        this.navAz = Math.atan2(this.navPose.x, this.navPose.z);
        this.navEl = Math.asin(Math.max(-1, Math.min(1, this.navPose.y / this.navDist)));
      } else {
        this.navTarget.copy(this.camTarget);
        this.navAz = this.three.MathUtils.degToRad(this.opts.camera.azimuthDeg);
        this.navEl = this.three.MathUtils.degToRad(this.opts.camera.elevationDeg);
        this.navDist = this.dist;
      }
    }
  }

  private applyNavCamera(): void {
    if (!this.camera || !this.navTarget) return;
    // Same spherical convention as the authored framing in applyProgress.
    this.camera.position.set(
      this.navTarget.x + Math.sin(this.navAz) * Math.cos(this.navEl) * this.navDist,
      this.navTarget.y + Math.sin(this.navEl) * this.navDist,
      this.navTarget.z + Math.cos(this.navAz) * Math.cos(this.navEl) * this.navDist
    );
    this.camera.lookAt(this.navTarget);
    if (this.camLookTarget) this.camLookTarget.copy(this.navTarget);
    if (this.orthoView) this.applyOrthoProjection();
  }

  // Snap the author-mode viewport to a standard axis view, Blender-style
  // (Numpad 1 front / 3 right / 7 top; Ctrl flips to the opposite side —
  // back / left / bottom). Keeps the current view target and distance; only
  // meaningful in author mode, where the transient nav camera is active.
  private snapNavView(azDeg: number, elDeg: number): void {
    if (!this.navTarget) return;
    this.navAz = this.three.MathUtils.degToRad(azDeg);
    this.navEl = this.three.MathUtils.degToRad(elDeg);
    this.freeNav = true;
    this.camViewLock = false;
    this.applyProgress();
  }

  // Numpad 5 — Blender-style perspective/orthographic toggle for the author
  // viewport. The same camera object keeps the gizmo and picking working: only
  // the projection, the is*Camera flags, and the ortho frustum properties that
  // TransformControls reads are swapped.
  private setOrthoView(on: boolean): void {
    if (!this.camera) return;
    if (this.orthoView === on) return;
    if (on) {
      this.perspNear = this.camera.near;
      this.perspFar = this.camera.far;
      this.orthoView = true;
      this.camera.isPerspectiveCamera = false;
      this.camera.isOrthographicCamera = true;
      this.applyOrthoProjection();
    } else {
      this.orthoView = false;
      this.camera.isPerspectiveCamera = true;
      this.camera.isOrthographicCamera = false;
      this.camera.near = this.perspNear !== null ? this.perspNear : this.camera.near;
      this.camera.far = this.perspFar !== null ? this.perspFar : this.camera.far;
      this.camera.updateProjectionMatrix();
    }
  }

  // Re-fit the orthographic frustum around the model so the current framing
  // keeps its apparent size as you orbit, pan, and zoom. Cheap enough to run
  // every frame while orthoView is active.
  private applyOrthoProjection(): void {
    if (!this.camera || !this.navTarget) return;
    let d = this.camera.position.distanceTo(this.navTarget);
    if (!isFinite(d) || d < 1e-4) d = this.navDist || 1;
    const halfH = d * Math.tan(this.three.MathUtils.degToRad(this.camera.fov) / 2);
    const halfW = halfH * (this.camera.aspect || 1);
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.zoom = 1;
    this.camera.near = Math.max(0.1, d - this.fitRadius * 4);
    this.camera.far = d + this.fitRadius * 8;
    this.camera.projectionMatrix.makeOrthographic(this.camera.left, this.camera.right, this.camera.top, this.camera.bottom, this.camera.near, this.camera.far);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }

  private clampNavDist(): void {
    this.navDist = Math.max(this.fitRadius * 0.05, Math.min(this.fitRadius * 200, this.navDist));
  }

  // Keep the helper in sync with the camera it represents: before the first
  // seed that's the viewport camera (legacy mirror); once seeded, authoredCam
  // is authoritative and the helper only ever reads from it.
  private syncCamHelper(): void {
    if (!this.camHelper) return;
    if (this.authoredCamSeeded) this.updateCamHelperFromAuthored();
    else this.updateCamHelper();
  }

  // Mirror the authored framing into the helper's proxy camera. Call only when
  // the main camera holds the authored pose (the !freeNav path): the helper
  // must represent the authored camera, never the free-nav camera. The drawn
  // frustum brackets the model (real far = dist*25 would stretch past it).
  private updateCamHelper(): void {
    if (!this.authoredCam || !this.camera || !this.camHelper) return;
    this.authoredCam.position.copy(this.camera.position);
    this.authoredCam.quaternion.copy(this.camera.quaternion);
    this.authoredCam.fov = this.camera.fov;
    this.authoredCam.aspect = this.camera.aspect;
    this.authoredCam.near = Math.max(this.camera.near, this.dist * 0.4);
    this.authoredCam.far = this.dist * 1.6;
    this.authoredCam.updateProjectionMatrix();
    this.authoredCam.updateMatrixWorld();
    this.camHelper.update();
  }

  // Blender-style camera editing. The authored camera (authoredCam) is a real
  // object the gizmo drives and keyframes export — never the transient viewport
  // camera. Its aim point is derived as position + forward * camEditDist, so
  // rotating re-aims and translating keeps the aim direction.
  private authoredCamLookTarget(): THREE.Vector3 {
    const v = new this.three.Vector3();
    if (!this.authoredCam) return v;
    this.authoredCam.getWorldDirection(v);
    return v.multiplyScalar(this.camEditDist).add(this.authoredCam.position);
  }

  // Seed the editable camera object from the active keyframe's pinned pose.
  // Selecting Camera otherwise never moves it: it keeps whatever pose it has
  // (the authored framing it mirrors when not editing) and becomes the
  // authoritative, editable object — the viewport never overwrites it again.
  // force re-seeds from the current viewport view (Reset only).
  private seedAuthoredCam(force?: boolean): void {
    if (!this.authoredCam) return;
    const pose = (this.activeKf >= 0 && this.keyframes[this.activeKf] && this.keyframes[this.activeKf].camPos && this.keyframes[this.activeKf].camTarget) ? this.keyframes[this.activeKf] : null;
    if (pose) {
      this.authoredCam.position.copy(pose.camPos!);
      this.authoredCam.lookAt(pose.camTarget!);
      this.camEditDist = Math.max(this.authoredCam.position.distanceTo(pose.camTarget!), 0.001);
    } else if (force && this.camera) {
      this.authoredCam.position.copy(this.camera.position);
      const look = this.camLookTarget || this.camTarget;
      if (look) {
        this.authoredCam.lookAt(look);
        this.camEditDist = Math.max(this.authoredCam.position.distanceTo(look), 0.001);
      }
    }
    this.authoredCamSeeded = true;
  }

  // Frame the authored camera gizmo WITHOUT re-aiming the viewport: keep the
  // user's current view target and azimuth/elevation (derived from the live
  // camera pose when not navigating), and only dolly back along the same view
  // axis until the gizmo projects on screen. Looking through the authored
  // camera puts it dead-center on the view axis, so pulling back always works.
  // Pass noDolly to skip the dolly-out entirely: the nav state is still synced
  // to the current camera pose so enabling nav mode never jumps the viewport.
  private seedNavFromAuthoredCam(noDolly?: boolean): void {
    if (!this.authoredCam || !this.camera || !this.navTarget || !this.navPose) return;
    const look = this.camLookTarget || this.camTarget;
    if (!this.freeNav && look) this.navTarget.copy(look);
    this.navPose.subVectors(this.camera.position, this.navTarget);
    const len = Math.max(this.navPose.length(), 0.001);
    this.navDist = len;
    this.navAz = Math.atan2(this.navPose.x, this.navPose.z);
    this.navEl = Math.asin(Math.max(-1, Math.min(1, this.navPose.y / len)));
    if (noDolly) return;
    for (let i = 0; i < 8; i++) {
      this.navDist *= 1.5;
      this.clampNavDist();
      this.applyNavCamera();
      if (this.gizmoOnScreen()) break;
    }
  }

  // Report whether the authored camera (gizmo anchor) projects inside the
  // viewport with a comfortable margin: |NDC| < 0.75 and in front of the far
  // plane (z < 1). Used to skip re-framing when the gizmo is already visible.
  private gizmoOnScreen(): boolean {
    if (!this.authoredCam || !this.camera) return false;
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    const p = new this.three.Vector3().copy(this.authoredCam.position).project(this.camera);
    return Math.abs(p.x) < 0.75 && Math.abs(p.y) < 0.75 && p.z < 1;
  }

  // Point the nav view down the authored camera (Blender Numpad 0). Shared by
  // lookThroughAuthoredCam() and the gizmo objectChange handler so the through-
  // view keeps following camera edits.
  private navFromAuthoredCamPose(): void {
    if (!this.authoredCam || !this.navTarget || !this.navPose) return;
    this.navTarget.copy(this.authoredCamLookTarget());
    this.navPose.subVectors(this.authoredCam.position, this.navTarget);
    this.navDist = Math.max(this.navPose.length(), 0.001);
    this.navAz = Math.atan2(this.navPose.x, this.navPose.z);
    this.navEl = Math.asin(Math.max(-1, Math.min(1, this.navPose.y / this.navDist)));
  }

  // Blender-style "look through camera": point the viewport down the authored
  // camera so you see exactly what it will capture, then orbit from there.
  private lookThroughAuthoredCam(): void {
    if (!this.authoredCam || !this.navTarget || !this.navPose) return;
    this.navFromAuthoredCamPose();
    this.freeNav = true;
    this.camViewLock = true;
    this.applyProgress();
  }

  // Refresh the camera wireframe from the authored camera's current pose while
  // it is being edited (near/far bracket the aim point so the frustum stays
  // compact around the model).
  private updateCamHelperFromAuthored(): void {
    if (!this.authoredCam || !this.camHelper || !this.camera) return;
    this.authoredCam.aspect = this.camera.aspect;
    this.authoredCam.fov = this.camera.fov;
    this.authoredCam.near = Math.max(this.authoredCam.near, this.camEditDist * 0.4);
    this.authoredCam.far = Math.max(this.authoredCam.near + 1, this.camEditDist * 1.6);
    this.authoredCam.updateProjectionMatrix();
    this.authoredCam.updateMatrixWorld();
    this.camHelper.update();
  }

  // Arrow fields so attachNav()/detachNav() add and remove the exact same
  // listener references (mirrors the original's closure functions).
  private navPointerDown = (e: PointerEvent): void => {
    if (!e.isPrimary || this.navDrag) return;
    const mmb = (e.button === 1) || (e.button === 0 && e.altKey);
    if (!mmb) return; // plain LMB must pass through to the gizmo untouched
    let mode: 'orbit' | 'pan' | 'zoom' | null = null;
    if (e.shiftKey && !e.ctrlKey) mode = 'pan';
    else if (e.ctrlKey && !e.shiftKey) mode = 'zoom';
    else if (!e.shiftKey && !e.ctrlKey) mode = 'orbit';
    // Shift+Ctrl+MMB dolly is out of scope — leave it alone.
    if (!mode) return;
    e.stopPropagation();
    e.preventDefault();
    this.navDrag = { mode: mode, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    this.freeNav = true;
    this.camViewLock = false;
    // Pointer capture keeps the gesture alive outside the canvas; guard against
    // hosts/synthetic events where capturing an unknown pointerId throws.
    try { if (this.canvas) this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
  };

  private navPointerMove = (e: PointerEvent): void => {
    if (!this.navDrag || e.pointerId !== this.navDrag.pointerId) return;
    if (!this.camera || !this.navTarget) return;
    const drag = this.navDrag;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    e.stopPropagation();
    e.preventDefault();
    if (drag.mode === 'orbit') {
      const sens = this.three.MathUtils.degToRad(0.4); // Blender view_rotate_sensitivity_turntable
      // Grab-the-world turntable: content follows the cursor (drag right = the
      // model swings right / camera orbits left; drag up = model tips up).
      this.navAz -= sens * dx;
      this.navEl += sens * dy;
      const pole = Math.PI / 2 - 0.001;
      this.navEl = Math.max(-pole, Math.min(pole, this.navEl));
    } else if (drag.mode === 'pan') {
      this.camera.updateMatrixWorld();
      const scale = 2 * this.navDist * Math.tan(this.three.MathUtils.degToRad(this.camera.fov) / 2) / ((this.canvas && this.canvas.clientHeight) || 1);
      if (this.navRight) this.navRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
      if (this.navUp) this.navUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
      if (this.navRight) this.navTarget.addScaledVector(this.navRight, -dx * scale);
      if (this.navUp) this.navTarget.addScaledVector(this.navUp, dy * scale);
    } else if (drag.mode === 'zoom') {
      this.navDist *= Math.exp(dy * 0.005); // drag up = zoom in (Blender direction)
      this.clampNavDist();
    }
  };

  private navPointerUp = (e: PointerEvent): void => {
    if (!this.navDrag || e.pointerId !== this.navDrag.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
    this.navDrag = null;
    if (this.canvas && this.canvas.releasePointerCapture && this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    // End of a navigation gesture while the camera is being authored: fold the
    // final view into the active keyframe so it plays back.
    if (this.editorOpen && this.selType === 'camera' && this.activeKf >= 0) this.updateActiveKeyframe();
  };

  private navPointerCancel = (e: PointerEvent): void => {
    if (!this.navDrag || e.pointerId !== this.navDrag.pointerId) return;
    this.navDrag = null;
    if (this.canvas && this.canvas.releasePointerCapture && this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
  };

  private navWheel = (e: WheelEvent): void => {
    // In author mode the wheel over the canvas zooms instead of scrolling.
    e.preventDefault();
    if (!this.camera || !this.navTarget) return;
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 33;
    this.navDist *= Math.pow(1.2, d / 100); // Blender 1.2x per notch
    this.clampNavDist();
    this.freeNav = true;
    this.camViewLock = false;
  };

  private attachNav(): void {
    if (this.navAttached || !this.renderer) return;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.navPointerDown, { capture: true });
    el.addEventListener('pointermove', this.navPointerMove, { capture: true });
    el.addEventListener('pointerup', this.navPointerUp, { capture: true });
    el.addEventListener('pointercancel', this.navPointerCancel, { capture: true });
    el.addEventListener('wheel', this.navWheel, { passive: false });
    this.navAttached = true;
  }

  private detachNav(): void {
    if (!this.navAttached || !this.renderer) return;
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.navPointerDown, { capture: true });
    el.removeEventListener('pointermove', this.navPointerMove, { capture: true });
    el.removeEventListener('pointerup', this.navPointerUp, { capture: true });
    el.removeEventListener('pointercancel', this.navPointerCancel, { capture: true });
    el.removeEventListener('wheel', this.navWheel);
    this.navAttached = false;
  }

  // -------------------------------------------------------------------------
  // Author-mode editor (source initEditor). Root overlay appends to document.body
  // and is removed on dispose(). All styling via injected .ms3d-* CSS.
  // -------------------------------------------------------------------------
  private initEditor(): void {
    if (this.editorReady) return;
    if (!this.model) return;
    this.editorReady = true;
    this.editorOpen = true;
    document.body.classList.add('ms3d-editing');

    const wrap = document.createElement('div');
    wrap.className = 'ms3d-editor';
    wrap.style.setProperty('--ms3d-accent', this.opts.accentColor);
    document.body.appendChild(wrap);
    this.editorEl = wrap;

    // Blender-style top editor strip: object selection, transform tools, and
    // the global editor actions sit in one header row, like Blender's topbar +
    // 3D-view header.
    const bar = document.createElement('div');
    bar.className = 'ms3d-topbar';
    bar.innerHTML = [
      '<span class="ms3d-brand"><span class="ms3d-brand-dot"></span>ModelStory</span>',
      '<span class="ms3d-top-sep"></span>',
      '<span class="ms3d-top-label">Object:</span>',
      '<button class="ms3d-btn ms3d-sel" data-sel="model">Model</button>',
      '<button class="ms3d-btn ms3d-sel" data-sel="camera">Camera</button>',
      '<button class="ms3d-btn ms3d-sel" data-sel="key">Key</button>',
      '<button class="ms3d-btn ms3d-sel" data-sel="fill">Fill</button>',
      '<button class="ms3d-btn ms3d-sel" data-sel="rim">Rim</button>',
      '<span class="ms3d-top-sep"></span>',
      '<button class="ms3d-btn ms3d-mode" data-mode="translate" title="Move gizmo">Move</button>',
      '<button class="ms3d-btn ms3d-mode" data-mode="rotate" title="Rotate gizmo">Rotate</button>',
      '<button class="ms3d-btn ms3d-mode" data-mode="scale" title="Scale gizmo">Scale</button>',
      '<button class="ms3d-btn" id="ms3d-space" title="Gizmo orientation: Global or Local (like Blender)">Space: Global</button>',
      '<span class="ms3d-top-sep"></span>',
      '<button class="ms3d-btn" id="ms3d-undo" title="Undo (Ctrl+Z)">Undo</button>',
      '<button class="ms3d-btn" id="ms3d-redo" title="Redo (Ctrl+Y)">Redo</button>',
      '<span class="ms3d-top-spacer"></span>',
      '<button class="ms3d-btn" id="ms3d-import">Import</button>',
      '<button class="ms3d-btn" id="ms3d-export">Export</button>',
      '<button class="ms3d-btn" id="ms3d-help-open" title="Show instructions">?</button>'
    ].join('');
    wrap.appendChild(bar);

    // Blender-style left tool shelf: environment properties live here instead
    // of in the top bar.
    const shelf = document.createElement('div');
    shelf.className = 'ms3d-panel ms3d-shelf';
    shelf.innerHTML = [
      '<div class="ms3d-shelf-handle" id="ms3d-shelf-handle" title="Drag to move"><span>Environment</span><span class="ms3d-shelf-grip">⠿</span></div>',
      '<div class="ms3d-shelf-body">',
      '<div class="ms3d-row"><span class="ms3d-row-label">Light</span>' +
        '<input id="ms3d-env-light" type="range" min="0" max="3" step="0.05" value="1" class="ms3d-input-range">' +
        '<input id="ms3d-env-light-val" type="number" step="0.05" min="0" max="3" value="1" class="ms3d-input-num"></div>',
      '<div class="ms3d-row"><span class="ms3d-row-label">Color</span>' +
        '<input id="ms3d-env-color" type="color" value="#ffffff" class="ms3d-input-color-wide"></div>',
      '</div>'
    ].join('');
    wrap.appendChild(shelf);
    this.makeDraggable(shelf, document.getElementById('ms3d-shelf-handle')!);

    // Instructions open as a centered modal (Blender-style ? help).
    const helpModal = document.createElement('div');
    helpModal.className = 'ms3d-modal';
    helpModal.innerHTML = '<div class="ms3d-modal-card"><div class="ms3d-modal-head"><div class="ms3d-modal-title">Instructions</div><button class="ms3d-modal-close" id="ms3d-help-close">Close</button></div><div class="ms3d-help-modal-body">Scroll to a progress → position model/lights/camera → K. For the camera, select <b>Camera</b> — a camera object appears with a gizmo: drag/rotate it or edit its fields to aim, Numpad0 looks through it, K pins the pose (playback moves the camera between pinned keyframes). Click a diamond or drag the timeline to scrub. MMB/Alt+drag orbit · Shift+MMB pan · Wheel zoom · Numpad1/3/7 front/right/top views (Ctrl=opposite) · Numpad5 perspective/ortho · Numpad0 camera view.</div></div>';
    wrap.appendChild(helpModal);
    document.getElementById('ms3d-help-close')!.addEventListener('click', () => {
      helpModal.classList.remove('on');
    });
    document.getElementById('ms3d-help-open')!.addEventListener('click', () => {
      helpModal.classList.add('on');
    });

    this.panelBody = document.createElement('div');
    this.panelBody.className = 'ms3d-panel ms3d-panel-body';
    wrap.appendChild(this.panelBody);

    // Blender-style full-width timeline strip: header row with the current
    // frame / keyframe actions, then the track with playhead and diamonds.
    const tl = document.createElement('div');
    tl.className = 'ms3d-panel ms3d-timeline';
    tl.innerHTML = [
      '<div class="ms3d-tl-head">',
      '<button class="ms3d-btn" id="ms3d-prev" title="Previous keyframe">◀</button>',
      '<span class="ms3d-t-value" id="ms3d-t">0.000</span>',
      '<button class="ms3d-btn" id="ms3d-next" title="Next keyframe">▶</button>',
      '<span class="ms3d-top-sep"></span>',
      '<button class="ms3d-btn ms3d-btn-primary" id="ms3d-add" title="Add keyframe (K)">+ Keyframe</button>',
      '<button class="ms3d-btn" id="ms3d-del" title="Delete active keyframe">Delete</button>',
      '<span class="ms3d-tl-spacer"></span>',
      '<button class="ms3d-btn ms3d-btn-active" id="ms3d-lerp" title="Preview interpolation between keyframes, or hold each keyframe\'s values">Preview</button>',
      '<span class="ms3d-tl-label">Timeline</span>',
      '</div>',
      '<div class="ms3d-tl-stage"><div class="ms3d-track"></div><div class="ms3d-playhead" id="ms3d-playhead"></div><div class="ms3d-diamonds" id="ms3d-diamonds"></div></div>'
    ].join('');
    wrap.appendChild(tl);
    this.diamondsEl = document.getElementById('ms3d-diamonds') as HTMLDivElement;
    this.playheadEl = document.getElementById('ms3d-playhead') as HTMLDivElement;
    this.attachPlayheadScrub(tl.querySelector('.ms3d-tl-stage') as HTMLElement);

    const lightIconLayer = document.createElement('div');
    lightIconLayer.className = 'ms3d-light-icons';
    (['key', 'fill', 'rim'] as const).forEach((n) => {
      const icon = document.createElement('div');
      icon.className = 'ms3d-light-icon';
      icon.title = 'Select ' + n + ' light';
      icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21M12,4A5,5 0 0,1 17,9C17,11.38 15.81,13.47 14,14.74V16H10V14.74C8.19,13.47 7,11.38 7,9A5,5 0 0,1 12,4Z"/></svg>';
      icon.addEventListener('click', () => { this.selectObject(n); });
      lightIconLayer.appendChild(icon);
      this.lightIcons[n] = icon;
    });
    wrap.appendChild(lightIconLayer);

    this.exportModal = document.createElement('div');
    this.exportModal.className = 'ms3d-modal';
    this.exportModal.innerHTML = '<div class="ms3d-modal-card"><div class="ms3d-modal-head"><div class="ms3d-modal-title">Keyframes JSON</div><button class="ms3d-modal-close" id="ms3d-export-close">Close</button></div><textarea class="ms3d-textarea" id="ms3d-export-text" spellcheck="false"></textarea><div class="ms3d-actions"><button class="ms3d-btn ms3d-btn-primary" id="ms3d-export-copy">Copy</button></div></div>';
    wrap.appendChild(this.exportModal);
    this.exportText = document.getElementById('ms3d-export-text') as HTMLTextAreaElement;
    document.getElementById('ms3d-export-close')!.addEventListener('click', () => {
      this.exportModal!.classList.remove('on');
    });
    document.getElementById('ms3d-export-copy')!.addEventListener('click', () => {
      const text = this.exportText!.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => { this.legacyCopy(this.exportText!); });
      } else {
        this.legacyCopy(this.exportText!);
      }
    });

    this.importModal = document.createElement('div');
    this.importModal.className = 'ms3d-modal';
    this.importModal.innerHTML = '<div class="ms3d-modal-card"><div class="ms3d-modal-head"><div class="ms3d-modal-title">Import keyframes</div><button class="ms3d-modal-close" id="ms3d-import-close">Close</button></div><textarea class="ms3d-textarea" id="ms3d-import-text" spellcheck="false" placeholder="Paste JSON from Export"></textarea><div class="ms3d-actions"><button class="ms3d-btn ms3d-btn-primary" id="ms3d-import-apply">Apply</button><span class="ms3d-err" id="ms3d-import-err"></span></div></div>';
    wrap.appendChild(this.importModal);
    this.importText = document.getElementById('ms3d-import-text') as HTMLTextAreaElement;
    document.getElementById('ms3d-import-close')!.addEventListener('click', () => {
      this.importModal!.classList.remove('on');
    });
    document.getElementById('ms3d-import-apply')!.addEventListener('click', () => this.importKeyframes());

    document.getElementById('ms3d-add')!.addEventListener('click', () => this.addKeyframe());
    document.getElementById('ms3d-del')!.addEventListener('click', () => this.deleteActiveKeyframe());
    document.getElementById('ms3d-prev')!.addEventListener('click', () => this.jumpKeyframe(-1));
    document.getElementById('ms3d-next')!.addEventListener('click', () => this.jumpKeyframe(1));
    document.getElementById('ms3d-export')!.addEventListener('click', () => this.exportKeyframes());
    document.getElementById('ms3d-import')!.addEventListener('click', () => this.openImport());
    document.getElementById('ms3d-undo')!.addEventListener('click', () => this.undo());
    document.getElementById('ms3d-redo')!.addEventListener('click', () => this.redo());

    const envLightEl = document.getElementById('ms3d-env-light') as HTMLInputElement;
    const envLightValEl = document.getElementById('ms3d-env-light-val') as HTMLInputElement;
    const envColorEl = document.getElementById('ms3d-env-color') as HTMLInputElement;
    const syncEnv = (el: HTMLInputElement & { __pushedUndo?: boolean }): void => {
      if (!el.__pushedUndo) { el.__pushedUndo = true; this.pushUndo(); }
      this.envLightness = parseFloat(envLightValEl.value) || 1;
      this.envTint = envColorEl.value;
      this.applyEnvironment();
      if (this.activeKf >= 0) this.updateActiveKeyframe();
    };
    envLightEl.addEventListener('input', (e) => {
      const el = e.currentTarget as HTMLInputElement & { __pushedUndo?: boolean };
      envLightValEl.value = el.value;
      syncEnv(el);
    });
    envLightValEl.addEventListener('input', (e) => { syncEnv(e.currentTarget as HTMLInputElement & { __pushedUndo?: boolean }); });
    envColorEl.addEventListener('input', (e) => { syncEnv(e.currentTarget as HTMLInputElement & { __pushedUndo?: boolean }); });
    [envLightEl, envLightValEl, envColorEl].forEach((inp) => {
      inp.addEventListener('focus', (e) => {
        (e.currentTarget as HTMLInputElement & { __pushedUndo?: boolean }).__pushedUndo = false;
      });
    });
    document.getElementById('ms3d-lerp')!.addEventListener('click', (e) => {
      this.lerpEnabled = !this.lerpEnabled;
      const btn = e.currentTarget as HTMLButtonElement;
      btn.textContent = this.lerpEnabled ? 'Preview' : 'Hold';
      btn.classList.toggle('ms3d-btn-active', this.lerpEnabled);
      if (this.keyframes.length) {
        const s = this.sampleKeyframes(this.progress);
        if (s) { this.applyKfState(s); this.updateHelpers(); }
      }
    });

    wrap.querySelectorAll<HTMLButtonElement>('.ms3d-sel').forEach((b) => {
      b.addEventListener('click', () => { this.selectObject(b.dataset.sel as 'model' | 'camera' | 'key' | 'fill' | 'rim'); });
    });
    wrap.querySelectorAll<HTMLButtonElement>('.ms3d-mode').forEach((b) => {
      b.addEventListener('click', () => {
        if (this.gizmo) this.gizmo.setMode(b.dataset.mode as 'translate' | 'rotate' | 'scale');
      });
    });
    const spaceBtn = document.getElementById('ms3d-space') as HTMLButtonElement;
    const syncSpaceBtn = (): void => {
      spaceBtn.textContent = 'Space: ' + (this.gizmoSpace === 'local' ? 'Local' : 'Global');
      spaceBtn.classList.toggle('ms3d-btn-active', this.gizmoSpace === 'local');
    };
    spaceBtn.addEventListener('click', () => {
      this.gizmoSpace = this.gizmoSpace === 'world' ? 'local' : 'world';
      if (this.gizmo) this.gizmo.setSpace(this.gizmoSpace);
      syncSpaceBtn();
    });
    syncSpaceBtn();

    const camera = this.camera!;
    const renderer = this.renderer!;
    const scene = this.scene!;
    const gizmo = new this.TransformControls(camera, renderer.domElement);
    this.gizmo = gizmo;
    gizmo.addEventListener('dragging-changed', (e) => {
      this.isDragging = !!e.value;
      if (e.value) this.pushUndo();
      if (e.value && this.lightsMap[this.selType]) {
        this.kfLightRotStart = {
          quat: this.lightsMap[this.selType].quaternion.clone(),
          offset: this.lightsMap[this.selType].target.position.clone().sub(this.lightsMap[this.selType].position)
        };
      } else if (!e.value) {
        this.kfLightRotStart = null;
      }
    });
    gizmo.addEventListener('objectChange', () => {
      if (this.kfLightRotStart && this.lightsMap[this.selType] && gizmo.getMode() === 'rotate') {
        const L = this.lightsMap[this.selType];
        const delta = L.quaternion.clone().multiply(this.kfLightRotStart.quat.clone().invert());
        const off = this.kfLightRotStart.offset.clone().applyQuaternion(delta);
        L.target.position.copy(L.position).add(off);
        L.quaternion.copy(this.kfLightRotStart.quat);
      }
      this.updatePanel();
      if (this.activeKf >= 0) this.updateActiveKeyframe();
      if (this.selType === 'camera') {
        if (this.camHelper) this.updateCamHelperFromAuthored();
        // While looking through the camera, keep the viewport locked to the
        // edited pose so the user sees the change live.
        if (this.camViewLock) {
          this.navFromAuthoredCamPose();
          this.applyProgress();
        }
      } else if (this.selType === 'model') {
        (['key', 'fill', 'rim'] as const).forEach((n) => { if (this.lightsMap[n].target) this.lightsMap[n].target.position.copy(this.model!.position); });
      } else if (this.lightsMap[this.selType]) {
        this.refreshLightShadow(this.lightsMap[this.selType]);
      }
      this.updateHelpers();
    });
    gizmo.setSize(0.8);
    scene.add(gizmo);

    // Viewport navigation (author mode): lazily allocate the nav state vectors
    // and attach the capture-phase nav listeners (idempotent).
    if (!this.navTarget) this.navTarget = new this.three.Vector3();
    if (!this.navRight) this.navRight = new this.three.Vector3();
    if (!this.navUp) this.navUp = new this.three.Vector3();
    if (!this.navPose) this.navPose = new this.three.Vector3();
    if (!this.camFwd) this.camFwd = new this.three.Vector3();
    if (!this.camLookTarget) this.camLookTarget = new this.three.Vector3();
    if (!this.lightIconVec) this.lightIconVec = new this.three.Vector3();
    this.resetNavState();
    this.attachNav();

    // Authored-camera wireframe (Blender-style). The main camera is at the
    // authored framing here (freeNav is false), so updateCamHelper() is valid.
    if (!this.authoredCam) {
      this.authoredCam = new this.three.PerspectiveCamera(camera.fov, camera.aspect, 0.1, 10);
      // The authored camera must be part of the scene graph: TransformControls
      // reads object.parent when a gizmo drag starts, and the frame loop keeps
      // its matrixWorld fresh so picking stays accurate.
      scene.add(this.authoredCam);
    }
    if (!this.camHelper) {
      this.camHelper = new this.three.CameraHelper(this.authoredCam!);
      this.camHelper.visible = false;
      const camGrey = new this.three.Color(0x808080);
      this.camHelper.setColors(camGrey, camGrey, camGrey, camGrey, camGrey);
      scene.add(this.camHelper);
      this.syncCamHelper();
    }

    (['key', 'fill', 'rim'] as const).forEach((n) => {
      this.lightHelpers[n] = new this.three.SpotLightHelper(this.lightsMap[n]);
      this.lightHelpers[n].visible = false;
      scene.add(this.lightHelpers[n]);
    });

    // Blender-style reference grid + XYZ axis lines, shown only in author mode.
    if (!this.authorGrid) {
      this.authorGrid = new this.three.Group();
      const gsize = this.fitRadius * 2.4;
      const grid = new this.three.GridHelper(gsize, 24, 0x9a9a9a, 0x565656);
      grid.position.y = this.groundY;
      grid.material.transparent = true;
      grid.material.opacity = 0.28;
      this.authorGrid.add(grid);
      const alen = this.fitRadius * 1.35;
      const axisLines: Array<[THREE.Vector3, THREE.Vector3, number]> = [
        [new this.three.Vector3(-alen, 0, 0), new this.three.Vector3(alen, 0, 0), 0xff3b30],
        [new this.three.Vector3(0, -alen, 0), new this.three.Vector3(0, alen, 0), 0x34c759],
        [new this.three.Vector3(0, 0, -alen), new this.three.Vector3(0, 0, alen), 0x007aff]
      ];
      axisLines.forEach((d) => {
        const geo = new this.three.BufferGeometry().setFromPoints([d[0], d[1]]);
        const mat = new this.three.LineBasicMaterial({ color: d[2], transparent: true, opacity: 0.85 });
        this.authorGrid!.add(new this.three.Line(geo, mat));
      });
      this.authorGrid.visible = true;
      scene.add(this.authorGrid);
    }

    this.selectObject('model');
    // Land on the first keyframe so the editor opens with an active selection
    // instead of a limbo state; the snapshot is taken after so Reset returns
    // to this starting keyframe.
    this.ensureInitialKeyframeSelected();
    this.updatePlayhead();
    this.updatePanel();
    this.renderDiamonds();
    this.initialSnapshot = this.snapshot();

    this.keyHandler = this.onKey;
    window.addEventListener('keydown', this.keyHandler);
  }

  public enterEditor(): void {
    this.editorRequested = true;
    if (this.state === 'disposed') return;
    if (this.state === 'idle' || this.state === 'error') { this.startBootstrap(); return; }
    if (!this.editorReady) {
      if (this.model) this.initEditor();
      return;
    }
    this.editorOpen = true;
    document.body.classList.add('ms3d-editing');
    if (this.editorEl) this.editorEl.style.display = '';
    if (this.authorGrid) this.authorGrid.visible = true;
    if (this.panelBody) this.panelBody.classList.remove('ms3d-hidden');
    this.selectObject(this.selType);
    this.ensureInitialKeyframeSelected();
    this.updatePanel();
    this.updatePlayhead();
    this.renderDiamonds();
    this.resetNavState();
    this.attachNav();
    if (!this.keyHandler) {
      this.keyHandler = this.onKey;
      window.addEventListener('keydown', this.keyHandler);
    }
  }

  public exitEditor(): void {
    if (this.state === 'disposed') return;
    if (!this.editorReady) return;
    this.editorOpen = false;
    document.body.classList.remove('ms3d-editing');
    if (this.editorEl) this.editorEl.style.display = 'none';
    if (this.gizmo) this.gizmo.detach();
    if (this.authorGrid) this.authorGrid.visible = false;
    if (this.panelBody) this.panelBody.classList.add('ms3d-hidden');
    for (const n in this.lightHelpers) if (this.lightHelpers[n]) this.lightHelpers[n].visible = false;
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler); this.keyHandler = null; }
    this.detachNav();
    if (this.orthoView) this.setOrthoView(false);
    this.camViewLock = false;
    this.resetNavState();
    this.applyProgress(); // re-assert the authored camera framing immediately
  }

  private selectObject(name: 'model' | 'camera' | 'key' | 'fill' | 'rim'): void {
    this.selType = name;
    if (name !== 'camera') this.camViewLock = false;
    if (this.editorEl) {
      this.editorEl.querySelectorAll<HTMLElement>('.ms3d-sel').forEach((b) => {
        b.classList.toggle('ms3d-btn-active', b.dataset.sel === name);
      });
    }
    if (this.gizmo) {
      if (name === 'model' && this.model) this.gizmo.attach(this.model);
      else if (name === 'camera' && this.authoredCam) this.gizmo.attach(this.authoredCam);
      else if (this.lightsMap[name]) this.gizmo.attach(this.lightsMap[name]);
      else this.gizmo.detach();
    }
    // The camera is edited like any other object: the gizmo drives the authored
    // camera (authoredCam), which is what keyframes export. Selecting it moves
    // nothing — the viewport camera stays exactly where it is and the authored
    // camera keeps its pose. Only the transient nav mode is enabled (so the
    // frame loop stops snapping the viewport back to the authored framing),
    // with the nav state synced to the current camera pose to avoid any jump.
    // Orbit to inspect, Numpad 0 looks through the camera, K pins the pose.
    if (name === 'camera') {
      this.seedAuthoredCam();
      if (this.camHelper) this.updateCamHelperFromAuthored();
      if (!this.freeNav) {
        this.seedNavFromAuthoredCam(true);
        this.freeNav = true;
        this.applyProgress();
      }
    }
    if (this.panelBody) this.panelBody.classList.remove('ms3d-hidden');
    this.updateHelpers();
    this.updateLightIcons();
    this.updatePanel();
  }

  private updateHelpers(): void {
    if (this.selType === 'camera') {
      if (this.camHelper) this.updateCamHelperFromAuthored();
    }
    for (const n in this.lightHelpers) {
      const h = this.lightHelpers[n];
      if (h) {
        h.visible = (this.selType === n);
        if (h.visible) h.update();
      }
    }
  }

  private updateLightIcons(): void {
    if (!this.editorOpen || !this.camera || !this.canvas || !this.lightIconVec) return;
    const r = this.canvas.getBoundingClientRect();
    for (const n in this.lightIcons) {
      const el = this.lightIcons[n];
      const L = this.lightsMap[n];
      if (!el || !L) continue;
      this.lightIconVec.set(L.position.x, L.position.y, L.position.z).project(this.camera);
      if (this.lightIconVec.z > 1) { el.style.display = 'none'; continue; }
      const sel = (this.selType === n);
      el.style.display = 'block';
      el.style.left = ((this.lightIconVec.x + 1) / 2 * r.width + r.left) + 'px';
      el.style.top = ((1 - this.lightIconVec.y) / 2 * r.height + r.top) + 'px';
      el.style.opacity = sel ? '1' : '0.1';
      el.style.transform = 'translate(-50%,-50%) scale(' + (sel ? 1 : 0.5) + ')';
      el.style.color = L.color.getStyle();
    }
  }

  private closeGizmo(): void {
    if (this.gizmo) this.gizmo.detach();
    if (this.panelBody) this.panelBody.classList.add('ms3d-hidden');
    for (const n in this.lightHelpers) if (this.lightHelpers[n]) this.lightHelpers[n].visible = false;
  }

  private makeDraggable(el: HTMLElement, handle: HTMLElement): void {
    let drag: { dx: number; dy: number } | null = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('button, input')) return;
      const r = el.getBoundingClientRect();
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      el.style.bottom = 'auto';
      el.style.right = 'auto';
      el.style.transform = 'none';
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag) return;
      el.style.left = (e.clientX - drag.dx) + 'px';
      el.style.top = (e.clientY - drag.dy) + 'px';
    });
    handle.addEventListener('pointerup', () => {
      drag = null;
    });
  }

  private attachScrub(inp: HTMLInputElement, get: () => number, set: (v: number) => void, sens: number): void {
    let scrub: { x: number; val: number; active: boolean } | null = null;
    inp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      scrub = { x: e.clientX, val: get(), active: false };
      inp.setPointerCapture(e.pointerId);
    });
    inp.addEventListener('pointermove', (e) => {
      if (!scrub) return;
      const dx = e.clientX - scrub.x;
      if (!scrub.active && Math.abs(dx) > 2) {
        scrub.active = true;
        this.pushUndo();
        inp.style.cursor = 'ew-resize';
        inp.style.userSelect = 'none';
        e.preventDefault();
      }
      if (scrub.active) {
        set(scrub.val + dx * sens);
        inp.value = get().toFixed(3);
        if (this.activeKf >= 0) this.updateActiveKeyframe();
      }
    });
    inp.addEventListener('pointerup', () => {
      scrub = null;
      inp.style.cursor = '';
      inp.style.userSelect = '';
    });
  }

  private updatePanel(): void {
    if (!this.panelBody) return;
    let light: THREE.SpotLight | null = null;
    if (this.selType === 'model') {
      if (!this.model) return;
    } else if (this.selType === 'camera') {
      if (!this.authoredCam) return;
    } else {
      light = this.lightsMap[this.selType] || null;
      if (!light) return;
    }
    const bindings: Array<[string, () => number, (v: number) => void, number]> = [];
    if (this.selType === 'model') {
      const obj = this.model!;
      bindings.push(['Pos X', () => obj.position.x, (v) => { obj.position.x = v; }, 0.01]);
      bindings.push(['Pos Y', () => obj.position.y, (v) => { obj.position.y = v; }, 0.01]);
      bindings.push(['Pos Z', () => obj.position.z, (v) => { obj.position.z = v; }, 0.01]);
      bindings.push(['Rot X °', () => this.three.MathUtils.radToDeg(obj.rotation.x), (v) => { obj.rotation.x = this.three.MathUtils.degToRad(v); }, 0.2]);
      bindings.push(['Rot Y °', () => this.three.MathUtils.radToDeg(obj.rotation.y), (v) => { obj.rotation.y = this.three.MathUtils.degToRad(v); }, 0.2]);
      bindings.push(['Rot Z °', () => this.three.MathUtils.radToDeg(obj.rotation.z), (v) => { obj.rotation.z = this.three.MathUtils.degToRad(v); }, 0.2]);
    } else if (this.selType === 'camera') {
      // Edits drive the authored camera object that keyframes export — never
      // the transient viewport camera. The target is derived from the camera's
      // forward along camEditDist, so setting it re-aims the whole camera.
      const cam = this.authoredCam!;
      bindings.push(['Pos X', () => cam.position.x, (v) => { cam.position.x = v; }, 0.01]);
      bindings.push(['Pos Y', () => cam.position.y, (v) => { cam.position.y = v; }, 0.01]);
      bindings.push(['Pos Z', () => cam.position.z, (v) => { cam.position.z = v; }, 0.01]);
      bindings.push(['Target X', () => this.authoredCamLookTarget().x, (v) => { const t = this.authoredCamLookTarget(); t.x = v; cam.lookAt(t); this.camEditDist = Math.max(cam.position.distanceTo(t), 0.001); }, 0.01]);
      bindings.push(['Target Y', () => this.authoredCamLookTarget().y, (v) => { const t = this.authoredCamLookTarget(); t.y = v; cam.lookAt(t); this.camEditDist = Math.max(cam.position.distanceTo(t), 0.001); }, 0.01]);
      bindings.push(['Target Z', () => this.authoredCamLookTarget().z, (v) => { const t = this.authoredCamLookTarget(); t.z = v; cam.lookAt(t); this.camEditDist = Math.max(cam.position.distanceTo(t), 0.001); }, 0.01]);
    } else {
      const obj = light!;
      bindings.push(['Pos X', () => obj.position.x, (v) => { obj.position.x = v; this.refreshLightShadow(obj); }, 0.01]);
      bindings.push(['Pos Y', () => obj.position.y, (v) => { obj.position.y = v; this.refreshLightShadow(obj); }, 0.01]);
      bindings.push(['Pos Z', () => obj.position.z, (v) => { obj.position.z = v; this.refreshLightShadow(obj); }, 0.01]);
      bindings.push(['Intensity', () => obj.intensity, (v) => { obj.intensity = v; }, 0.005]);
      bindings.push(['Angle °', () => this.three.MathUtils.radToDeg(obj.angle), (v) => { obj.angle = this.three.MathUtils.degToRad(v); this.refreshLightShadow(obj); }, 0.2]);
      bindings.push(['Penumbra', () => obj.penumbra, (v) => { obj.penumbra = v; }, 0.01]);
      bindings.push(['Distance', () => obj.distance, (v) => { obj.distance = Math.max(0, v); this.refreshLightShadow(obj); }, 0.05]);
      bindings.push(['Decay', () => obj.decay, (v) => { obj.decay = v; }, 0.01]);
      bindings.push(['Target X', () => obj.target ? obj.target.position.x : 0, (v) => { if (obj.target) { obj.target.position.x = v; this.refreshLightShadow(obj); } }, 0.01]);
      bindings.push(['Target Y', () => obj.target ? obj.target.position.y : 0, (v) => { if (obj.target) { obj.target.position.y = v; this.refreshLightShadow(obj); } }, 0.01]);
      bindings.push(['Target Z', () => obj.target ? obj.target.position.z : 0, (v) => { if (obj.target) { obj.target.position.z = v; this.refreshLightShadow(obj); } }, 0.01]);
    }
    this.panelBody.innerHTML = '<div class="ms3d-panel-head" id="ms3d-panel-handle"><div class="ms3d-panel-title">' + this.selType + '</div><div class="ms3d-panel-tools"><button class="ms3d-panel-reset" id="ms3d-panel-reset" title="Reset to starting state">Reset</button><button class="ms3d-close-btn" id="ms3d-close" title="Close gizmo">✕</button></div></div><div class="ms3d-panel-content"></div>';
    const panelContent = this.panelBody.querySelector('.ms3d-panel-content')!;
    this.makeDraggable(this.panelBody, document.getElementById('ms3d-panel-handle')!);
    document.getElementById('ms3d-close')!.addEventListener('click', () => this.closeGizmo());
    document.getElementById('ms3d-panel-reset')!.addEventListener('click', () => this.resetSelection());
    if (this.selType !== 'model' && this.selType !== 'camera') {
      const obj = this.lightsMap[this.selType];
      const crow = document.createElement('div');
      crow.className = 'ms3d-input-row';
      crow.innerHTML = '<span>Color</span>';
      const cinp = document.createElement('input');
      cinp.type = 'color';
      cinp.value = '#' + obj.color.getHexString();
      cinp.className = 'ms3d-input-color-wide';
      cinp.addEventListener('input', (e) => {
        const el = e.currentTarget as HTMLInputElement & { __pushedUndo?: boolean };
        if (!el.__pushedUndo) { el.__pushedUndo = true; this.pushUndo(); }
        obj.color.set(el.value);
        if (this.activeKf >= 0) this.updateActiveKeyframe();
      });
      cinp.addEventListener('focus', (e) => {
        (e.currentTarget as HTMLInputElement & { __pushedUndo?: boolean }).__pushedUndo = false;
      });
      crow.appendChild(cinp);
      panelContent.appendChild(crow);
    }
    bindings.forEach((b) => {
      const row = document.createElement('div');
      row.className = 'ms3d-input-row';
      row.innerHTML = '<span>' + b[0] + '</span>';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = 'any';
      inp.value = b[1]().toFixed(3);
      const set = (v: number): void => {
        b[2](v);
        if (this.selType !== 'model') this.updateHelpers();
      };
      inp.addEventListener('focus', (e) => {
        (e.currentTarget as HTMLInputElement & { __pushedUndo?: boolean }).__pushedUndo = false;
      });
      inp.addEventListener('input', (e) => {
        const el = e.currentTarget as HTMLInputElement & { __pushedUndo?: boolean };
        if (!el.__pushedUndo) { el.__pushedUndo = true; this.pushUndo(); }
        set(parseFloat(el.value) || 0);
        if (this.activeKf >= 0) this.updateActiveKeyframe();
      });
      inp.addEventListener('change', (e) => {
        (e.currentTarget as HTMLInputElement).value = b[1]().toFixed(3);
      });
      this.attachScrub(inp, b[1], set, b[3]);
      row.appendChild(inp);
      panelContent.appendChild(row);
    });
  }

  // -------------------------------------------------------------------------
  // Keyframe capture / edit operations.
  // -------------------------------------------------------------------------
  private captureKeyframe(): Keyframe {
    const model = this.model!;
    const kf: Keyframe = {
      t: this.progress,
      modelPos: model.position.clone(),
      modelRot: { x: model.rotation.x, y: model.rotation.y, z: model.rotation.z },
      envLight: this.envLightness,
      envColor: this.envTint,
      camPos: null,
      camTarget: null,
      lights: {}
    };
    // Only when the camera is being authored is its current pose pinned into the
    // keyframe — model/light keyframes leave the camera on its authored framing
    // unless a neighbouring keyframe drives it. The pose comes from the editable
    // camera object (authoredCam), never the transient viewport camera.
    if (this.selType === 'camera' && this.authoredCam) {
      kf.camPos = this.authoredCam.position.clone();
      kf.camTarget = this.authoredCamLookTarget();
    }
    for (const n in this.lightsMap) {
      const L = this.lightsMap[n];
      kf.lights[n] = {
        pos: L.position.clone(),
        intensity: L.intensity,
        color: '#' + L.color.getHexString(),
        angle: L.angle,
        penumbra: L.penumbra,
        distance: L.distance,
        decay: L.decay,
        target: L.target ? L.target.position.clone() : model.position.clone()
      };
    }
    return kf;
  }

  private addKeyframe(): void {
    this.pushUndo();
    const kf = this.captureKeyframe();
    // While authoring the camera, K pins the current view onto the keyframe
    // that already exists at this progress (preserving its model/light state)
    // instead of stacking a duplicate with the same t.
    if (this.selType === 'camera') {
      for (let i = 0; i < this.keyframes.length; i++) {
        if (Math.abs(this.keyframes[i].t - this.progress) < 0.0005) {
          const ex = this.keyframes[i];
          kf.modelPos = ex.modelPos;
          kf.modelRot = ex.modelRot;
          kf.envLight = ex.envLight;
          kf.envColor = ex.envColor;
          kf.lights = ex.lights;
          kf.t = ex.t;
          this.keyframes[i] = kf;
          this.activeKf = i;
          this.renderDiamonds();
          this.updatePlayhead();
          return;
        }
      }
    }
    this.keyframes.push(kf);
    this.keyframes.sort((a, b) => a.t - b.t);
    this.activeKf = this.keyframes.indexOf(kf);
    this.renderDiamonds();
    this.updatePlayhead();
  }

  private deleteActiveKeyframe(): void {
    if (this.activeKf < 0) return;
    this.pushUndo();
    this.keyframes.splice(this.activeKf, 1);
    this.activeKf = -1;
    this.renderDiamonds();
  }

  // The host page may set scroll-behavior:smooth, which turns imperative
  // scrolls into animated ones — the editor's progress-based jumps then lag,
  // and late scroll events keep firing after a keyframe click. Force an
  // instant jump so keyframe selection lands exactly where it was asked:
  // 'instant' jumps unconditionally where supported, and flushing the inline
  // 'auto' style before the call covers engines that still animate otherwise.
  private hardScrollTo(y: number): void {
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    getComputedStyle(html).scrollBehavior;
    window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior });
    html.style.scrollBehavior = prev;
  }

  private selectKeyframe(i: number): void {
    if (!this.keyframes.length || i < 0 || i >= this.keyframes.length) return;
    // A click both selects AND scrolls to that frame. The programmatic scroll
    // fires further scroll events — synchronously from the manual dispatch
    // below, asynchronously from the browser — whose recomputed progress
    // drifts from the keyframe's exact t (pixel quantization alone is ~1e-4).
    // That would make applyAuthorPreview drop the selection we just made, so
    // hold the deselection off until the scroll has settled.
    this.kfJumpGuard = true;
    clearTimeout(this.kfJumpGuardTimer!);
    this.activeKf = i;
    const kf = this.keyframes[i];
    this.progress = kf.t;
    if (this.opts.progressMode === 'manual') {
      this.setProgress(kf.t);
    } else {
      const total = this.opts.container.offsetHeight - window.innerHeight;
      this.hardScrollTo(this.progress * total);
      window.dispatchEvent(new Event('scroll'));
    }
    // The scroll dispatch recomputes progress from the pixel-quantized scroll
    // position, which drifts a hair from the keyframe's exact t — enough to
    // make applyAuthorPreview drop the selection mid-click. Re-assert both
    // so the selection sticks.
    this.activeKf = i;
    this.progress = kf.t;
    this.applyKfState(kf);
    // While editing the camera, scrub its object to the selected keyframe's
    // pinned pose so the gizmo tracks what K will capture here.
    if (this.selType === 'camera') {
      this.seedAuthoredCam();
      if (this.camHelper) this.updateCamHelperFromAuthored();
    }
    this.syncEnvControls();
    this.renderDiamonds();
    this.updatePanel();
    this.updatePlayhead();
    this.kfJumpGuardTimer = setTimeout(() => { this.kfJumpGuard = false; }, 300);
  }

  // Author mode must never start in a "limbo" state with no keyframe active:
  // whenever the editor opens (or keyframes finish loading while it is open)
  // and nothing is selected yet, land on the first keyframe. An existing
  // selection is always preserved.
  private ensureInitialKeyframeSelected(): void {
    if (this.editorOpen && this.activeKf < 0 && this.keyframes.length) this.selectKeyframe(0);
  }

  private jumpKeyframe(dir: number): void {
    if (!this.keyframes.length) return;
    if (this.activeKf < 0) {
      this.selectKeyframe(dir > 0 ? 0 : this.keyframes.length - 1);
    } else {
      this.selectKeyframe(this.activeKf + dir);
    }
  }

  private updateActiveKeyframe(): void {
    if (this.activeKf < 0) return;
    const t = this.keyframes[this.activeKf].t;
    const prev = this.keyframes[this.activeKf];
    const kf = this.captureKeyframe();
    // Editing the model/lights must not drop a camera pose the keyframe pinned.
    if (this.selType !== 'camera') {
      kf.camPos = prev.camPos ? prev.camPos.clone() : null;
      kf.camTarget = prev.camTarget ? prev.camTarget.clone() : null;
    }
    kf.t = t;
    this.keyframes[this.activeKf] = kf;
    this.renderDiamonds();
  }

  // -------------------------------------------------------------------------
  // Export / Import modals + helpers.
  // -------------------------------------------------------------------------
  private exportKeyframes(): void {
    if (!this.exportModal) return;
    const json = this.getExportJSON();
    this.exportText!.value = json;
    this.exportModal.classList.add('on');
    if (this.opts.onExport) this.opts.onExport(json);
  }

  private openImport(): void {
    if (!this.importModal) return;
    const err = document.getElementById('ms3d-import-err');
    if (err) err.textContent = '';
    this.importModal.classList.add('on');
    this.importText!.focus();
  }

  private importKeyframes(): void {
    if (!this.importModal) return;
    const err = document.getElementById('ms3d-import-err')!;
    const raw = this.importText!.value.trim();
    if (!raw) { err.textContent = 'Paste JSON first'; return; }
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      err.textContent = 'Invalid JSON: ' + ((e as Error).message || String(e));
      return;
    }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.keyframes) ? data.keyframes : null);
    if (!list) { err.textContent = 'Expected an array or { keyframes: [...] }'; return; }
    const out = this.parseKeyframesList(list, (msg) => { err.textContent = msg; });
    if (!out) return;
    this.pushUndo();
    this.applyEnvFromData(data);
    this.keyframes.length = 0;
    out.forEach((kf) => { this.keyframes.push(kf); });
    this.activeKf = -1;
    this.renderDiamonds();
    this.updatePlayhead();
    this.updatePanel();
    this.syncEnvControls();
    this.importModal.classList.remove('on');
  }

  private legacyCopy(ta: HTMLTextAreaElement): void {
    ta.select();
    document.execCommand('copy');
  }

  private renderDiamonds(): void {
    if (!this.diamondsEl) return;
    this.diamondsEl.innerHTML = '';
    this.keyframes.forEach((kf, i) => {
      const d = document.createElement('button');
      d.className = 'ms3d-diamond' + (i === this.activeKf ? ' ms3d-diamond-active' : '');
      d.style.left = (kf.t * 100) + '%';
      d.title = 't=' + kf.t.toFixed(3);
      d.addEventListener('click', () => { this.selectKeyframe(i); });
      this.diamondsEl!.appendChild(d);
    });
  }

  private updatePlayhead(): void {
    if (this.playheadEl) this.playheadEl.style.left = (this.progress * 100) + '%';
    const tv = document.getElementById('ms3d-t');
    if (tv) tv.textContent = this.progress.toFixed(3);
  }

  // While scrubbing in author mode (preview off), the model should still show
  // the interpolated (or held) keyframe state. applyProgress() deliberately
  // skips the model while the editor is open so the gizmo edits aren't clobbered
  // every frame, so this is only invoked from user scrub events (scroll, playhead
  // drag), never from the animation loop.
  private applyAuthorPreview(): void {
    if (!this.editorOpen || !this.model || !this.keyframes.length || this.isDragging) return;
    // Ignore scroll events emitted while a keyframe click's scroll settles:
    // they recompute a slightly-drifting progress that would wrongly drop the
    // selection made by selectKeyframe.
    if (this.kfJumpGuard) return;
    if (this.activeKf >= 0 && Math.abs(this.progress - this.keyframes[this.activeKf].t) > 1e-6) {
      this.activeKf = -1;
      this.renderDiamonds();
    }
    const s = this.sampleKeyframes(this.progress);
    if (s) { this.applyKfState(s); this.updateHelpers(); this.syncEnvControls(); }
  }

  private scrubTo(p: number): void {
    this.progress = Math.max(0, Math.min(1, p));
    if (this.opts.progressMode === 'scroll') {
      const total = this.opts.container.offsetHeight - window.innerHeight;
      if (total > 0) this.hardScrollTo(this.progress * total);
    }
    this.applyProgress();
    this.applyAuthorPreview();
    if (this.opts.onProgress) this.opts.onProgress(this.progress);
  }

  private attachPlayheadScrub(stage: HTMLElement): void {
    let drag: { x: number; scrubbing: boolean } | null = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (t && t.classList && t.classList.contains('ms3d-diamond')) return;
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      drag = { x: e.clientX, scrubbing: false };
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.scrubbing && Math.abs(e.clientX - drag.x) > 2) drag.scrubbing = true;
      if (drag.scrubbing) {
        this.scrubTo((e.clientX - stage.getBoundingClientRect().left) / stage.getBoundingClientRect().width);
      }
    });
    stage.addEventListener('pointerup', (e) => {
      if (!drag) return;
      this.scrubTo((e.clientX - stage.getBoundingClientRect().left) / stage.getBoundingClientRect().width);
      drag = null;
    });
    stage.addEventListener('pointercancel', () => { drag = null; });
  }

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) { this.undo(); e.preventDefault(); return; }
      if ((e.key === 'z' || e.key === 'Z') && e.shiftKey) { this.redo(); e.preventDefault(); return; }
      if (e.key === 'y' || e.key === 'Y') { this.redo(); e.preventDefault(); return; }
    }
    if ((e.code === 'Numpad0' || (e.key === '0' && e.location === 3)) && !e.repeat) {
      if (this.selType === 'camera') this.lookThroughAuthoredCam();
      else if (this.freeNav) { this.resetNavState(); this.applyProgress(); }
      e.preventDefault();
      return;
    }
    if ((e.code === 'Numpad1' || (e.key === '1' && e.location === 3)) && !e.repeat) {
      this.snapNavView(e.ctrlKey ? 180 : 0, 0);
      e.preventDefault();
      return;
    }
    if ((e.code === 'Numpad3' || (e.key === '3' && e.location === 3)) && !e.repeat) {
      this.snapNavView(e.ctrlKey ? -90 : 90, 0);
      e.preventDefault();
      return;
    }
    if ((e.code === 'Numpad5' || (e.key === '5' && e.location === 3)) && !e.repeat) {
      this.setOrthoView(!this.orthoView);
      e.preventDefault();
      return;
    }
    if ((e.code === 'Numpad7' || (e.key === '7' && e.location === 3)) && !e.repeat) {
      this.snapNavView(0, e.ctrlKey ? -90 : 90);
      e.preventDefault();
      return;
    }
    if ((e.key === 'k' || e.key === 'K') && !e.repeat) { this.addKeyframe(); e.preventDefault(); }
    if (e.key === 'Delete' || e.key === 'Backspace') this.deleteActiveKeyframe();
  };

  // -------------------------------------------------------------------------
  // Teardown. Mirrors the original's dispose() exactly.
  // -------------------------------------------------------------------------
  public dispose(): void {
    if (this.state === 'disposed') return;
    this.state = 'disposed';
    activeInstance = null;
    this.stopLoop();
    this.detachNav();
    this.freeNav = false;
    this.camViewLock = false;
    this.orthoView = false;
    this.navDrag = null;
    if (this.camHelper) {
      if (this.scene) this.scene.remove(this.camHelper);
      if (this.camHelper.dispose) this.camHelper.dispose();
      this.camHelper = null;
      this.authoredCam = null;
    }
    if (this.authorGrid) {
      if (this.scene) this.scene.remove(this.authorGrid);
      this.authorGrid = null;
    }
    if (this.io) this.io.disconnect();
    if (this.ro) this.ro.disconnect();
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler); this.keyHandler = null; }
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onWinResize);
    if (this.editorEl && this.editorEl.parentNode) this.editorEl.parentNode.removeChild(this.editorEl);
    this.editorEl = null;
    this.editorReady = false;
    this.editorOpen = false;
    document.body.classList.remove('ms3d-editing');
    if (this.loaderEl && this.loaderEl.parentNode) this.loaderEl.parentNode.removeChild(this.loaderEl);
    this.loaderEl = null;
    if (this.autoCanvas && this.autoCanvas.parentNode) this.autoCanvas.parentNode.removeChild(this.autoCanvas);
    this.autoCanvas = null;
    if (this.madeContainerRelative && this.opts && this.opts.container) this.opts.container.style.position = '';
    if (this.pmrem) { this.pmrem.dispose(); this.pmrem = null; }
    if (this.renderer) { this.renderer.dispose(); this.renderer = null; }
    this.scene = null;
    this.camera = null;
    this.model = null;
    this.lightsMap = {};
    this.lightHelpers = {};
    this.keyframes = [];
    styleUsers -= 1;
    if (styleUsers <= 0) {
      const st = document.getElementById('ms3d-styles');
      if (st && st.parentNode) st.parentNode.removeChild(st);
      styleUsers = 0;
    }
  }
}
