/*
 * model-story.js
 * Standalone Three.js scroll-story viewer + author-mode keyframe editor.
 * Extracted from the iPrimus cargo landing page (index.html, <script type="module"> block,
 * lines 1265-2454). Self-contained: Three.js r160 is loaded from jsdelivr CDN and an
 * importmap is injected into document.head only when the host page does not already map
 * "three". Classic script — include with a single <script src="model-story.js"></script>.
 *
 * One-line usage:
 *   var handle = await ModelStory.create({ container: document.getElementById('hero'), model: 'assets/truck.glb', keyframes: 'keyframes.json' });
 *
 * Export JSON format: { version:1, env:{light,color}, keyframes:[
 *   { t, modelPos, modelRot, truckPos, truckRot, envLight, envColor,
 *     lights:{ key:{ pos, intensity, color, angle, penumbra, distance, decay, target } } } ] }
 * (each keyframe carries both modelPos/modelRot and legacy truckPos/truckRot so output stays
 *  importable by the legacy iprimus page).
 */
(function () {
  'use strict';

  var THREE = null;
  var GLTFLoader = null;
  var RoomEnvironment = null;
  var MeshoptDecoder = null;
  var TransformControls = null;

  var LOAD_TIMEOUT = 15000;
  var loadTimer = null;

  var opts = null;
  var _state = 'idle'; // 'idle' | 'loading' | 'ready' | 'error' | 'disposed'
  var _instanceActive = false;
  var _editorEnabled = false;
  var _editorRequested = false;
  var _reduced = false;
  var _isMobile = false;
  var _styleUsers = 0;
  var _madeContainerRelative = false;

  var canvas = null;
  var autoCanvas = null;
  var loaderEl = null;
  var loaderBar = null;
  var loaderPct = null;

  var model = null;
  var lightsMap = {};
  var scene = null;
  var camera = null;
  var renderer = null;
  var dist = 1;
  var baseAngle = 0;
  var camTarget = null;
  var fitRadius = 4;
  var groundY = 0;
  var shadowPlane = null;
  var lightHelpers = {};
  var pmrem = null;
  var envLightness = 1;
  var envTint = '#ffffff';
  var lastEnvLight = null;
  var lastEnvColor = null;
  var _c1 = null, _c2 = null, _c3 = null;

  var KEYFRAMES = [];
  var progress = 0;
  var inView = false;
  var rafId = null;
  var viewerInit = false;
  var _io = null;
  var _ro = null;
  var _keyHandler = null;

  var editorReady = false;
  var editorOpen = false;
  var editorEl = null;
  var selType = 'model';
  var activeKf = -1;
  var autoPlay = false;
  var isDragging = false;
  var gizmo = null;
  var panelBody = null;
  var playheadEl = null;
  var diamondsEl = null;
  var exportModal = null;
  var exportText = null;
  var importModal = null;
  var importText = null;
  var undoStack = [];
  var redoStack = [];
  var initialSnapshot = null;
  var kfLightRotStart = null;

  // ---------------------------------------------------------------------------
  // Self-contained UI styling (injected once into document.head as #ms3d-styles).
  // Accent color is driven by the inherited CSS variable --ms3d-accent, set per
  // instance on the editor root / loader element.
  // ---------------------------------------------------------------------------
  var STYLE_CSS = `
.ms3d-editor{position:fixed;inset:0;z-index:100;pointer-events:none;color:#fff}
.ms3d-editor *{box-sizing:border-box}
.ms3d-panel{pointer-events:auto;position:absolute;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(12,12,11,.9);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);padding:12px 16px;color:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.6);font-size:11px;line-height:1.4}
.ms3d-bar{top:64px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;min-width:320px}
.ms3d-bar-handle{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--ms3d-accent,#fa7c1d);cursor:grab;user-select:none}
.ms3d-bar-grip{color:rgba(255,255,255,.3);font-size:10px}
.ms3d-row{display:flex;align-items:center;gap:8px;font-size:11px;color:rgba(255,255,255,.6)}
.ms3d-env-label{display:flex;align-items:center;gap:6px;cursor:default}
.ms3d-dim{color:rgba(255,255,255,.4)}
.ms3d-btn{pointer-events:auto;padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.1);color:#fff;font-size:11px;line-height:1.2;border:none;cursor:pointer;font-family:inherit}
.ms3d-btn:hover{background:rgba(255,255,255,.2)}
.ms3d-btn-primary{background:var(--ms3d-accent,#fa7c1d);color:#fff;font-weight:700}
.ms3d-btn-primary:hover{background:#e05e00}
.ms3d-btn-active{background:var(--ms3d-accent,#fa7c1d)}
.ms3d-btn-active:hover{background:#e05e00}
.ms3d-t-value{color:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.ms3d-input-range{width:112px;accent-color:#f46500}
.ms3d-input-num{width:56px;border-radius:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:2px 6px;color:#fff;font-size:11px;font-family:inherit}
.ms3d-input-color{width:24px;height:24px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:transparent;cursor:pointer;padding:0}
.ms3d-input-color-wide{flex:1;height:28px;border-radius:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:4px;cursor:pointer}
.ms3d-help{font-size:10px;color:rgba(255,255,255,.4)}
.ms3d-panel-body{top:240px;left:50%;transform:translateX(-50%);width:420px}
.ms3d-panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;cursor:grab;user-select:none}
.ms3d-panel-title{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.4)}
.ms3d-panel-tools{display:flex;align-items:center;gap:4px}
.ms3d-panel-reset{font-size:10px;color:rgba(255,255,255,.5);background:none;border:none;cursor:pointer;padding:2px 6px;border-radius:6px;font-family:inherit}
.ms3d-panel-reset:hover{color:var(--ms3d-accent,#fa7c1d);background:rgba(255,255,255,.1)}
.ms3d-close-btn{background:none;border:none;color:rgba(255,255,255,.5);cursor:pointer;font-size:14px;line-height:1;padding:0 4px;font-family:inherit}
.ms3d-close-btn:hover{color:#fff}
.ms3d-input-row{display:flex;align-items:center;gap:8px;font-size:11px;margin-bottom:6px}
.ms3d-input-row > span{flex:none;width:80px;color:rgba(255,255,255,.5)}
.ms3d-input-row input[type=number]{flex:1;border-radius:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:4px 8px;color:#fff;font-size:11px;font-family:inherit}
.ms3d-timeline{bottom:40px;left:50%;transform:translateX(-50%);width:min(90vw,760px);padding:12px 16px}
.ms3d-tl-handle{display:flex;justify-content:center;cursor:grab;user-select:none;color:rgba(255,255,255,.3);font-size:10px;margin-bottom:4px;margin-top:-4px}
.ms3d-tl-stage{position:relative;height:32px}
.ms3d-track{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:4px;border-radius:2px;background:rgba(255,255,255,.1)}
.ms3d-playhead{position:absolute;top:0;bottom:0;width:2px;transform:translateX(-50%);background:var(--ms3d-accent,#fa7c1d)}
.ms3d-diamonds{position:absolute;inset:0}
.ms3d-diamond{position:absolute;top:50%;width:12px;height:12px;border-radius:9999px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.2);cursor:pointer;padding:0;transform:translate(-50%,-50%)}
.ms3d-diamond:hover{background:rgba(255,255,255,.4)}
.ms3d-diamond-active{background:var(--ms3d-accent,#fa7c1d);border-color:var(--ms3d-accent,#fa7c1d)}
.ms3d-modal{pointer-events:auto;position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.7);padding:24px}
.ms3d-modal.on{display:flex}
.ms3d-modal-card{width:100%;max-width:672px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:#0c0c0b;padding:16px;color:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,.6)}
.ms3d-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.ms3d-modal-title{font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--ms3d-accent,#fa7c1d)}
.ms3d-modal-close{background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:14px;font-family:inherit;padding:0}
.ms3d-modal-close:hover{color:#fff}
.ms3d-textarea{width:100%;height:256px;border-radius:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:rgba(255,255,255,.8);box-sizing:border-box;resize:vertical}
.ms3d-actions{display:flex;gap:8px;margin-top:12px;align-items:center}
.ms3d-err{font-size:11px;color:#f87171;align-self:center}
.ms3d-hidden{display:none!important}
.ms3d-loader{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;z-index:5;pointer-events:none}
.ms3d-loader-spin{width:18px;height:18px;border-radius:9999px;border:2px solid rgba(255,255,255,.15);border-top-color:var(--ms3d-accent,#fa7c1d);animation:ms3d-spin .8s linear infinite}
@keyframes ms3d-spin{to{transform:rotate(360deg)}}
.ms3d-loader-bar-wrap{width:160px;height:3px;border-radius:9999px;background:rgba(255,255,255,.1);overflow:hidden}
.ms3d-loader-bar{height:100%;width:0%;background:var(--ms3d-accent,#fa7c1d);transition:width .15s ease}
.ms3d-loader-pct{font-size:11px;color:rgba(255,255,255,.8);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
`;

  function ensureStyle() {
    if (!document.getElementById('ms3d-styles')) {
      var s = document.createElement('style');
      s.id = 'ms3d-styles';
      s.textContent = STYLE_CSS;
      document.head.appendChild(s);
    }
    _styleUsers += 1;
  }

  // ---------------------------------------------------------------------------
  // Three.js loading. Try the host page's import map first; on failure inject a
  // CDN import map into document.head and retry; reject with a clear message.
  // ---------------------------------------------------------------------------
  function importModules() {
    return Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/environments/RoomEnvironment.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
      import('three/addons/controls/TransformControls.js')
    ]).then(function (mods) {
      return {
        THREE: mods[0],
        GLTFLoader: mods[1].GLTFLoader,
        RoomEnvironment: mods[2].RoomEnvironment,
        MeshoptDecoder: mods[3].MeshoptDecoder,
        TransformControls: mods[4].TransformControls
      };
    });
  }

  function loadThree() {
    return importModules().catch(function () {
      var im = document.createElement('script');
      im.type = 'importmap';
      im.textContent = JSON.stringify({
        imports: {
          'three': 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
          'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/'
        }
      });
      document.head.appendChild(im);
      return importModules();
    });
  }

  function startBootstrap() {
    _state = 'loading';
    loadThree().then(function (mods) {
      if (_state === 'disposed') return;
      THREE = mods.THREE;
      GLTFLoader = mods.GLTFLoader;
      RoomEnvironment = mods.RoomEnvironment;
      MeshoptDecoder = mods.MeshoptDecoder;
      TransformControls = mods.TransformControls;
      baseAngle = THREE.MathUtils.degToRad(50);
      camTarget = new THREE.Vector3();
      _c1 = new THREE.Color();
      _c2 = new THREE.Color();
      _c3 = new THREE.Color();
      setup();
      _state = 'ready';
    }).catch(function (err) {
      if (_state === 'disposed') return;
      _state = 'error';
      if (opts.onError) opts.onError(err);
      console.error('[ModelStory] Could not load three.js r160. Add an importmap to the host page manually mapping "three" to https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js and "three/addons/" to https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/ (or restore network access to jsdelivr), then retry.', err);
    });
  }

  function normalizeOptions(options) {
    return {
      container: options.container,
      canvas: options.canvas || null,
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
        azimuthDeg: (options.camera && options.camera.azimuthDeg) || 38,
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

  function create(options) {
    if (!options) return Promise.reject(new Error('ModelStory.create: options object is required'));
    var container = options.container;
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container || !container.nodeType) return Promise.reject(new Error('ModelStory.create: options.container (Element) is required'));
    if (typeof options.model !== 'string' || !options.model) return Promise.reject(new Error('ModelStory.create: options.model (URL string) is required'));
    if (_instanceActive) return Promise.reject(new Error('ModelStory.create: only one instance per page is supported; call handle.dispose() first'));

    _instanceActive = true;
    _editorRequested = false;
    opts = normalizeOptions(options);
    opts.container = container;
    _editorEnabled = opts.editor === 'auto' ? (new URLSearchParams(location.search).get('edit') === '1') : !!opts.editor;
    _reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    _isMobile = window.matchMedia('(hover: none)').matches || window.innerWidth < 768;

    var handle = makeHandle();

    var skip = null;
    if (!_editorEnabled) {
      if (opts.disableOn.reducedMotion && _reduced) skip = 'reduced-motion';
      else if (opts.disableOn.mobile && _isMobile) skip = 'mobile';
    }
    if (!skip && !window.WebGLRenderingContext) skip = 'no-webgl';

    if (skip) {
      _state = 'idle';
      if (opts.onSkip) opts.onSkip(skip);
      return Promise.resolve(handle);
    }

    return loadThree().then(function (mods) {
      if (_state === 'disposed') return handle;
      THREE = mods.THREE;
      GLTFLoader = mods.GLTFLoader;
      RoomEnvironment = mods.RoomEnvironment;
      MeshoptDecoder = mods.MeshoptDecoder;
      TransformControls = mods.TransformControls;
      baseAngle = THREE.MathUtils.degToRad(50);
      camTarget = new THREE.Vector3();
      _c1 = new THREE.Color();
      _c2 = new THREE.Color();
      _c3 = new THREE.Color();
      setup();
      _state = 'ready';
      return handle;
    }).catch(function (err) {
      _state = 'error';
      _instanceActive = false;
      if (opts.onError) opts.onError(err);
      console.error('[ModelStory] Could not load three.js r160. Add an importmap to the host page manually mapping "three" to https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js and "three/addons/" to https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/, or ensure network access to the CDN.', err);
      throw err;
    });
  }

  function makeHandle() {
    return {
      setProgress: setProgress,
      getProgress: getProgress,
      play: play,
      pause: pause,
      enterEditor: enterEditor,
      exitEditor: exitEditor,
      exportJSON: exportJSON,
      importJSON: importJSON,
      dispose: dispose
    };
  }

  // ---------------------------------------------------------------------------
  // Setup: style + canvas inside the caller's container, IntersectionObserver
  // loop control (rootMargin '250px 0px', like source), scroll driver.
  // ---------------------------------------------------------------------------
  function setup() {
    ensureStyle();
    var cs = window.getComputedStyle(opts.container);
    if (cs.position === 'static') {
      opts.container.style.position = 'relative';
      _madeContainerRelative = true;
    }

    if (opts.canvas) {
      canvas = opts.canvas;
    } else {
      canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.display = 'block';
      canvas.style.setProperty('width', '100%', 'important');
      canvas.style.setProperty('height', '100%', 'important');
      opts.container.appendChild(canvas);
      autoCanvas = canvas;
    }

    _io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        inView = e.isIntersecting;
        if (inView && viewerInit && scene) startLoop();
        else if (!inView) stopLoop();
        if (inView && !viewerInit) initViewer();
      });
    }, { rootMargin: '250px 0px' });
    _io.observe(opts.container);

    if (opts.progressMode === 'scroll') {
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    var r = opts.container.getBoundingClientRect();
    if ((r.bottom > 0 && r.top < window.innerHeight) || _editorEnabled || _editorRequested) {
      inView = true;
      initViewer();
    }
    applyProgress();
  }

  // ---------------------------------------------------------------------------
  // Viewer init (source initViewer): renderer, PMREM RoomEnvironment, 3 spotlights,
  // GLTF load with meshopt, sizing to canvas.clientWidth/Height.
  // ---------------------------------------------------------------------------
  function initViewer() {
    if (viewerInit) return;
    viewerInit = true;
    if (!window.WebGLRenderingContext) return;

    loadKeyframes();
    showLoading();

    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    } catch (e) {
      hideLoading();
      if (opts.onError) opts.onError(e);
      console.error('[ModelStory] WebGL context creation failed', e);
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, _isMobile ? 1.25 : 2));

    scene = new THREE.Scene();
    scene.background = null;
    pmrem = new THREE.PMREMGenerator(renderer);
    envLightness = opts.environment.light;
    envTint = opts.environment.color;
    applyEnvironment();

    camera = new THREE.PerspectiveCamera(opts.camera.fov, 1, 0.1, 200);
    resize();

    var lightDefs = [
      { name: 'key', color: 0xfff1e0, intensity: 1.7, position: [5, 9, 4], angleDeg: 38, penumbra: 0.3, distance: 0, decay: 1.5 },
      { name: 'fill', color: 0x9db8ff, intensity: 0.45, position: [-6, 5, -6], angleDeg: 42, penumbra: 0.4, distance: 0, decay: 1.5 },
      { name: 'rim', color: 0xffb877, intensity: 0.5, position: [-3, 2, -8], angleDeg: 40, penumbra: 0.35, distance: 0, decay: 1.5 }
    ];
    lightDefs.forEach(function (d) {
      var o = opts.lights[d.name] || {};
      var color = o.color !== undefined ? o.color : d.color;
      var intensity = o.intensity !== undefined ? o.intensity : d.intensity;
      var L = new THREE.SpotLight(color, intensity);
      var pos = o.position || d.position;
      L.position.set(pos[0], pos[1], pos[2]);
      L.name = d.name;
      L.castShadow = true;
      L.shadow.radius = 3;
      L.shadow.bias = -0.0003;
      L.shadow.normalBias = 0.03;
      L.angle = THREE.MathUtils.degToRad(o.angleDeg !== undefined ? o.angleDeg : d.angleDeg);
      L.penumbra = o.penumbra !== undefined ? o.penumbra : d.penumbra;
      L.distance = o.distance !== undefined ? o.distance : d.distance;
      L.decay = o.decay !== undefined ? o.decay : d.decay;
      lightsMap[d.name] = L;
      scene.add(L);
      L.target = new THREE.Object3D();
      scene.add(L.target);
    });

    var gltfLoader = new GLTFLoader();
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    gltfLoader.load(opts.model, onModelLoaded, onLoadProgress, onLoadError);

    if (typeof ResizeObserver !== 'undefined') {
      _ro = new ResizeObserver(function () { resize(); });
      _ro.observe(canvas);
    } else {
      window.addEventListener('resize', onWinResize);
    }
  }

  function onModelLoaded(gltf) {
    model = gltf.scene;
    scene.add(model);

    var box = new THREE.Box3().setFromObject(model);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    model.position.sub(center);

    var sphere = box.getBoundingSphere(new THREE.Sphere());
    groundY = box.min.y - center.y;
    fitRadius = sphere.radius;

    model.traverse(function (o) {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    ['key', 'fill', 'rim'].forEach(function (n) {
      var L = lightsMap[n];
      L.shadow.mapSize.set(1024, 1024);
      refreshLightShadow(L);
    });

    var radius = sphere.radius * 1.5;
    shadowPlane = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, opacity: 0.5, depthWrite: false })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = groundY + 0.01;
    scene.add(shadowPlane);

    var vfov = THREE.MathUtils.degToRad(camera.fov);
    var hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    var fov = Math.min(vfov, hfov);
    dist = (sphere.radius / Math.tan(fov / 2)) * opts.camera.fitPadding;
    if (_isMobile) dist *= opts.camera.mobileDistScale;

    camera.near = dist / 60;
    camera.far = dist * 25;
    camera.updateProjectionMatrix();

    camTarget.set(0, -size.y * 0.42, 0);
    resize();
    if (KEYFRAMES.length) applyKfState(sampleKeyframes(progress));
    applyProgress();
    hideLoading();
    if (opts.onLoad) opts.onLoad();
    if (inView) startLoop();
    if (_editorEnabled || _editorRequested) initEditor();
  }

  function onLoadProgress(xhr) {
    if (!loaderBar) return;
    var total = xhr.total || 1;
    var pct = Math.min(100, Math.round((xhr.loaded / total) * 100));
    loaderBar.style.width = pct + '%';
    if (loaderPct) loaderPct.textContent = Math.min(pct, 99) + '%';
  }

  function onLoadError(err) {
    hideLoading();
    if (opts.onError) opts.onError(err);
    console.error('[ModelStory] model load failed', err);
  }

  // ---------------------------------------------------------------------------
  // Built-in loader overlay (inside container, centered at bottom).
  // ---------------------------------------------------------------------------
  function showLoading() {
    if (!opts.loader) return;
    if (!loaderEl) {
      loaderEl = document.createElement('div');
      loaderEl.className = 'ms3d-loader';
      loaderEl.style.setProperty('--ms3d-accent', opts.accentColor);
      loaderEl.innerHTML = '<div class="ms3d-loader-spin"></div><div class="ms3d-loader-bar-wrap"><div class="ms3d-loader-bar"></div></div><div class="ms3d-loader-pct">0%</div>';
      opts.container.appendChild(loaderEl);
      loaderBar = loaderEl.querySelector('.ms3d-loader-bar');
      loaderPct = loaderEl.querySelector('.ms3d-loader-pct');
    }
    loaderEl.style.display = 'flex';
    clearTimeout(loadTimer);
    loadTimer = setTimeout(function () { hideLoading(); }, LOAD_TIMEOUT);
  }

  function hideLoading() {
    clearTimeout(loadTimer);
    if (loaderEl) loaderEl.style.display = 'none';
  }

  // ---------------------------------------------------------------------------
  // Sizing: renderer + camera aspect tracked from the canvas element itself
  // (ResizeObserver on canvas, window-resize fallback) — embeds may not be
  // full-viewport, unlike the source.
  // ---------------------------------------------------------------------------
  function onWinResize() { resize(); }

  function resize() {
    if (!camera || !renderer) return;
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  // ---------------------------------------------------------------------------
  // Progress: scroll math identical to source (p = -rect.top / (height - innerHeight)).
  // ---------------------------------------------------------------------------
  function onScroll() {
    if (opts.progressMode !== 'scroll') return;
    updateProgress();
    applyProgress();
  }

  function updateProgress() {
    if (opts.progressMode !== 'scroll') return;
    var rect = opts.container.getBoundingClientRect();
    var total = opts.container.offsetHeight - window.innerHeight;
    if (total <= 0) { progress = 0; return; }
    var p = -rect.top / total;
    progress = Math.max(0, Math.min(1, p));
  }

  function applyProgress() {
    var now = performance.now();

    if (model && !editorOpen) {
      if (KEYFRAMES.length) {
        var ks = sampleKeyframes(progress);
        if (ks) applyKfState(ks);
      } else if (!_reduced && opts.spin) {
        var spinT = smoothstep(0.26, 0.92, progress);
        var sway = (progress < 0.22) ? Math.sin(now * 0.0011) * 0.06 : 0;
        model.rotation.y = baseAngle + spinT * Math.PI * 2 + sway;
      } else {
        model.rotation.y = baseAngle;
      }
    }

    if (editorEl && editorOpen) updatePlayhead();

    if (camera && camTarget) {
      // Single fixed camera target for the whole scroll: one framing, no
      // scene-transition camera work. It must NEVER depend on keyframe data or the
      // live model position: that keeps author mode and the published site
      // pixel-identical (no stale/derived state) and lets the model move
      // within the frame.
      var az = THREE.MathUtils.degToRad(opts.camera.azimuthDeg);
      var el = THREE.MathUtils.degToRad(opts.camera.elevationDeg);
      var dolly = 1;
      if (!(KEYFRAMES.length && model) && progress > 0.84) {
        dolly = 1 - 0.1 * ((progress - 0.84) / 0.16);
      }
      camera.position.set(
        camTarget.x + Math.sin(az) * Math.cos(el) * dist * dolly,
        camTarget.y + Math.sin(el) * dist * dolly,
        camTarget.z + Math.cos(az) * Math.cos(el) * dist * dolly
      );
      camera.lookAt(camTarget);
    }

    if (opts.onProgress) opts.onProgress(progress);
  }

  function animate() {
    updateProgress();
    applyProgress();
    if (renderer && scene && camera) renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  }

  function startLoop() {
    if (rafId == null) animate();
  }

  function stopLoop() {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ---------------------------------------------------------------------------
  // Environment (PMREM RoomEnvironment with quantized caching) + light shadows.
  // ---------------------------------------------------------------------------
  function quantEnvColor(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) / 16);
    var g = Math.round(((n >> 8) & 255) / 16);
    var b = Math.round((n & 255) / 16);
    return (r << 8) | (g << 4) | b;
  }

  function applyEnvironment() {
    if (!pmrem) return;
    var q = Math.round(envLightness * 50);
    var qc = quantEnvColor(envTint);
    if (lastEnvLight === q && lastEnvColor === qc) return;
    lastEnvLight = q;
    lastEnvColor = qc;
    var tint = new THREE.Color(envTint);
    var env = new RoomEnvironment();
    env.traverse(function (o) {
      if (o.isMesh && o.material && o.material.color) o.material.color.multiplyScalar(envLightness).multiply(tint);
      if (o.isPointLight) { o.intensity *= envLightness; o.color.copy(tint); }
    });
    var newEnv = pmrem.fromScene(env, 0.04).texture;
    if (scene.environment) scene.environment.dispose();
    scene.environment = newEnv;
    env.dispose();
  }

  function syncEnvControls() {
    var sl = document.getElementById('ms3d-env-light');
    var val = document.getElementById('ms3d-env-light-val');
    var col = document.getElementById('ms3d-env-color');
    if (sl) sl.value = String(Math.round(envLightness * 100) / 100);
    if (val) val.value = String(Math.round(envLightness * 1000) / 1000);
    if (col) col.value = envTint;
  }

  function refreshLightShadow(L) {
    if (!L || !L.shadow || !fitRadius) return;
    L.angle = THREE.MathUtils.clamp(L.angle, 0.01, THREE.MathUtils.degToRad(85));
    var cam = L.shadow.camera;
    var tgt = L.target || L;
    var d = L.position.distanceTo(tgt.position);
    var far = L.distance > 0 ? Math.min(L.distance + fitRadius, d + fitRadius * 4) : d + fitRadius * 4;
    cam.near = Math.max(0.05, Math.min(d, far) - fitRadius * 2);
    cam.far = Math.max(cam.near + 1, far);
    cam.fov = Math.min(170, THREE.MathUtils.radToDeg(L.angle) * 2);
    cam.updateProjectionMatrix();
  }

  function makeShadowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // Keyframe engine (ported verbatim, truck* renamed to model* semantics).
  // ---------------------------------------------------------------------------
  function smoothstep(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function kfLerp(a, b, t) { return a + (b - a) * t; }

  function kfLerp3(a, b, t, out) {
    out.x = kfLerp(a.x, b.x, t);
    out.y = kfLerp(a.y, b.y, t);
    out.z = kfLerp(a.z, b.z, t);
    return out;
  }

  function kfLerpColor(ha, hb, t) {
    _c1.set(ha); _c2.set(hb); _c3.copy(_c1).lerp(_c2, t);
    return '#' + _c3.getHexString();
  }

  function sampleKeyframes(p) {
    if (!KEYFRAMES.length) return null;
    if (p <= KEYFRAMES[0].t) return KEYFRAMES[0];
    var last = KEYFRAMES[KEYFRAMES.length - 1];
    if (p >= last.t) return last;
    for (var i = 0; i < KEYFRAMES.length - 1; i++) {
      var a = KEYFRAMES[i], b = KEYFRAMES[i + 1];
      if (p >= a.t && p <= b.t) {
        var span = b.t - a.t;
        var f = span === 0 ? 0 : (p - a.t) / span;
        return blendKeyframes(a, b, f);
      }
    }
    return last;
  }

  function blendKeyframes(a, b, f) {
    var al = typeof a.envLight === 'number' ? a.envLight : 1;
    var bl = typeof b.envLight === 'number' ? b.envLight : 1;
    var out = {
      modelPos: kfLerp3(a.modelPos, b.modelPos, f, new THREE.Vector3()),
      modelRot: { x: kfLerp(a.modelRot.x, b.modelRot.x, f), y: kfLerp(a.modelRot.y, b.modelRot.y, f), z: kfLerp(a.modelRot.z, b.modelRot.z, f) },
      envLight: kfLerp(al, bl, f),
      envColor: kfLerpColor(a.envColor || '#ffffff', b.envColor || '#ffffff', f),
      lights: {}
    };
    for (var n in a.lights) {
      var la = a.lights[n], lb = b.lights[n];
      if (!lb) continue;
      out.lights[n] = {
        pos: kfLerp3(la.pos, lb.pos, f, new THREE.Vector3()),
        intensity: kfLerp(la.intensity, lb.intensity, f),
        color: kfLerpColor(la.color, lb.color, f),
        angle: kfLerp(la.angle, lb.angle, f),
        penumbra: kfLerp(la.penumbra, lb.penumbra, f),
        distance: kfLerp(la.distance, lb.distance, f),
        decay: kfLerp(la.decay, lb.decay, f),
        target: kfLerp3(la.target, lb.target, f, new THREE.Vector3())
      };
    }
    return out;
  }

  function applyKfState(s) {
    if (!model) return;
    model.position.copy(s.modelPos);
    model.rotation.set(s.modelRot.x, s.modelRot.y, s.modelRot.z);
    if (typeof s.envLight === 'number') envLightness = s.envLight;
    if (s.envColor) envTint = s.envColor;
    applyEnvironment();
    if (shadowPlane) shadowPlane.position.y = groundY + 0.01;
    for (var n in s.lights) {
      var L = lightsMap[n];
      if (!L) continue;
      var d = s.lights[n];
      L.position.copy(d.pos);
      L.intensity = d.intensity;
      L.color.set(d.color);
      L.angle = d.angle;
      L.penumbra = d.penumbra;
      L.distance = d.distance;
      L.decay = d.decay;
      if (L.target) L.target.position.copy(d.target || s.modelPos);
      refreshLightShadow(L);
    }
  }

  // ---------------------------------------------------------------------------
  // Keyframe JSON: load from URL / inline object / plain array; accept both
  // modelPos/truckPos (modelPos wins); exporter emits both keys per keyframe.
  // ---------------------------------------------------------------------------
  function parseKeyframesList(list, onErr) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      if (!k || typeof k.t !== 'number') { if (onErr) onErr('Keyframe ' + i + ' has no numeric t'); return null; }
      var pos = k.modelPos || k.truckPos || {};
      var rot = k.modelRot || k.truckRot || {};
      var kf = {
        t: k.t,
        modelPos: new THREE.Vector3(pos.x || 0, pos.y || 0, pos.z || 0),
        modelRot: { x: rot.x || 0, y: rot.y || 0, z: rot.z || 0 },
        envLight: typeof k.envLight === 'number' ? k.envLight : 1,
        envColor: k.envColor || '#ffffff',
        lights: {}
      };
      for (var n in (k.lights || {})) {
        var l = k.lights[n] || {};
        var lp = l.pos || {};
        var lt = l.target ? { x: l.target.x || 0, y: l.target.y || 0, z: l.target.z || 0 } : (pos.x !== undefined ? { x: pos.x || 0, y: pos.y || 0, z: pos.z || 0 } : { x: 0, y: 0, z: 0 });
        kf.lights[n] = {
          pos: new THREE.Vector3(lp.x || 0, lp.y || 0, lp.z || 0),
          intensity: typeof l.intensity === 'number' ? l.intensity : 0,
          color: l.color || '#ffffff',
          angle: typeof l.angle === 'number' ? l.angle : THREE.MathUtils.degToRad(38),
          penumbra: typeof l.penumbra === 'number' ? l.penumbra : 0.3,
          distance: typeof l.distance === 'number' ? l.distance : 0,
          decay: typeof l.decay === 'number' ? l.decay : 1.5,
          target: new THREE.Vector3(lt.x || 0, lt.y || 0, lt.z || 0)
        };
      }
      out.push(kf);
    }
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  function applyEnvFromData(data) {
    if (!data || !data.env) return;
    if (typeof data.env.light === 'number') envLightness = data.env.light;
    if (data.env.color) envTint = data.env.color;
    applyEnvironment();
  }

  function handleKfData(data) {
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.keyframes) ? data.keyframes : null);
    if (!list || !list.length) return;
    var out = parseKeyframesList(list);
    if (!out) return;
    applyEnvFromData(data);
    KEYFRAMES.length = 0;
    out.forEach(function (kf) { KEYFRAMES.push(kf); });
    if (model) applyKfState(sampleKeyframes(progress));
    renderDiamonds();
    updatePlayhead();
    updatePanel();
    applyProgress();
  }

  function loadKeyframes() {
    if (!opts.keyframes) return;
    if (typeof opts.keyframes === 'string') {
      fetch(opts.keyframes)
        .then(function (r) { return r.json(); })
        .then(handleKfData)
        .catch(function () {});
    } else {
      handleKfData(opts.keyframes);
    }
  }

  function getExportJSON() {
    return JSON.stringify({
      version: 1,
      env: { light: envLightness, color: envTint },
      keyframes: KEYFRAMES.map(function (k) {
        var kf = {
          t: k.t,
          modelPos: { x: k.modelPos.x, y: k.modelPos.y, z: k.modelPos.z },
          modelRot: { x: k.modelRot.x, y: k.modelRot.y, z: k.modelRot.z },
          truckPos: { x: k.modelPos.x, y: k.modelPos.y, z: k.modelPos.z },
          truckRot: { x: k.modelRot.x, y: k.modelRot.y, z: k.modelRot.z },
          envLight: k.envLight,
          envColor: k.envColor,
          lights: {}
        };
        Object.keys(k.lights).forEach(function (n) {
          var l = k.lights[n];
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

  // ---------------------------------------------------------------------------
  // Undo / Redo: 60-deep stacks, full-state snapshots.
  // ---------------------------------------------------------------------------
  function snapshot() {
    return {
      activeKf: activeKf,
      env: { light: envLightness, color: envTint },
      keyframes: KEYFRAMES.map(function (k) {
        return {
          t: k.t,
          modelPos: [k.modelPos.x, k.modelPos.y, k.modelPos.z],
          modelRot: [k.modelRot.x, k.modelRot.y, k.modelRot.z],
          envLight: k.envLight,
          envColor: k.envColor,
          lights: Object.keys(k.lights).reduce(function (o, n) {
            var l = k.lights[n];
            o[n] = { pos: [l.pos.x, l.pos.y, l.pos.z], intensity: l.intensity, color: l.color, angle: l.angle, penumbra: l.penumbra, distance: l.distance, decay: l.decay, target: [l.target.x, l.target.y, l.target.z] };
            return o;
          }, {})
        };
      }),
      model: { pos: [model.position.x, model.position.y, model.position.z], rot: [model.rotation.x, model.rotation.y, model.rotation.z], scale: [model.scale.x, model.scale.y, model.scale.z] },
      lights: Object.keys(lightsMap).reduce(function (o, n) {
        var L = lightsMap[n];
        o[n] = { pos: [L.position.x, L.position.y, L.position.z], intensity: L.intensity, color: '#' + L.color.getHexString(), angle: L.angle, penumbra: L.penumbra, distance: L.distance, decay: L.decay, target: [L.target.position.x, L.target.position.y, L.target.position.z] };
        return o;
      }, {})
    };
  }

  function restoreSnapshot(s) {
    KEYFRAMES.length = 0;
    s.keyframes.forEach(function (k) {
      var kf = {
        t: k.t,
        modelPos: new THREE.Vector3().fromArray(k.modelPos),
        modelRot: { x: k.modelRot[0], y: k.modelRot[1], z: k.modelRot[2] },
        envLight: typeof k.envLight === 'number' ? k.envLight : 1,
        envColor: k.envColor || '#ffffff',
        lights: {}
      };
      for (var n in k.lights) {
        var l = k.lights[n];
        kf.lights[n] = {
          pos: new THREE.Vector3().fromArray(l.pos),
          intensity: l.intensity,
          color: l.color,
          angle: typeof l.angle === 'number' ? l.angle : THREE.MathUtils.degToRad(38),
          penumbra: typeof l.penumbra === 'number' ? l.penumbra : 0.3,
          distance: typeof l.distance === 'number' ? l.distance : 0,
          decay: typeof l.decay === 'number' ? l.decay : 1.5,
          target: new THREE.Vector3().fromArray(l.target || l.pos)
        };
      }
      KEYFRAMES.push(kf);
    });
    model.position.fromArray(s.model.pos);
    model.rotation.fromArray(s.model.rot);
    model.scale.fromArray(s.model.scale);
    for (var n in s.lights) {
      var L = lightsMap[n];
      if (!L) continue;
      var sl = s.lights[n];
      L.position.fromArray(sl.pos);
      L.intensity = sl.intensity;
      L.color.set(sl.color);
      L.angle = sl.angle;
      L.penumbra = sl.penumbra;
      L.distance = sl.distance;
      L.decay = sl.decay;
      if (L.target && sl.target) L.target.position.fromArray(sl.target);
      refreshLightShadow(L);
    }
    activeKf = s.activeKf !== undefined && s.activeKf < KEYFRAMES.length ? s.activeKf : -1;
    if (s.env) {
      if (typeof s.env.light === 'number') envLightness = s.env.light;
      if (s.env.color) envTint = s.env.color;
    }
    applyEnvironment();
    renderDiamonds();
    updatePanel();
    updatePlayhead();
    syncEnvControls();
  }

  function pushUndo() {
    if (!model) return;
    undoStack.push(snapshot());
    redoStack.length = 0;
    if (undoStack.length > 60) undoStack.shift();
  }

  function undo() {
    if (!model || !undoStack.length) return;
    redoStack.push(snapshot());
    restoreSnapshot(undoStack.pop());
  }

  function redo() {
    if (!model || !redoStack.length) return;
    undoStack.push(snapshot());
    restoreSnapshot(redoStack.pop());
  }

  function resetSelection() {
    if (!initialSnapshot || !model) return;
    pushUndo();
    var s = initialSnapshot;
    if (selType === 'model') {
      model.position.fromArray(s.model.pos);
      model.rotation.fromArray(s.model.rot);
      model.scale.fromArray(s.model.scale);
    } else if (s.lights[selType]) {
      var L = lightsMap[selType];
      var sl = s.lights[selType];
      L.position.fromArray(sl.pos);
      L.intensity = sl.intensity;
      L.color.set(sl.color);
      L.angle = sl.angle;
      L.penumbra = sl.penumbra;
      L.distance = sl.distance;
      L.decay = sl.decay;
      if (L.target && sl.target) L.target.position.fromArray(sl.target);
      refreshLightShadow(L);
    }
    if (activeKf >= 0) updateActiveKeyframe();
    updatePanel();
  }

  // ---------------------------------------------------------------------------
  // Author-mode editor (source initEditor). Root overlay appends to document.body
  // and is removed on dispose(). All styling via injected .ms3d-* CSS.
  // ---------------------------------------------------------------------------
  function initEditor() {
    if (editorReady) return;
    if (!model) return;
    editorReady = true;
    editorOpen = true;
    document.body.classList.add('ms3d-editing');

    var wrap = document.createElement('div');
    wrap.className = 'ms3d-editor';
    wrap.style.setProperty('--ms3d-accent', opts.accentColor);
    document.body.appendChild(wrap);
    editorEl = wrap;

    var bar = document.createElement('div');
    bar.className = 'ms3d-panel ms3d-bar';
    bar.innerHTML = [
      '<div class="ms3d-bar-handle" id="ms3d-bar-handle" title="Drag to move"><span>Author mode</span><span class="ms3d-bar-grip">⠿</span></div>',
      '<div class="ms3d-row"><span>Select:</span>' +
        '<button class="ms3d-btn ms3d-sel" data-sel="model">Model</button>' +
        '<button class="ms3d-btn ms3d-sel" data-sel="key">Key</button>' +
        '<button class="ms3d-btn ms3d-sel" data-sel="fill">Fill</button>' +
        '<button class="ms3d-btn ms3d-sel" data-sel="rim">Rim</button></div>',
      '<div class="ms3d-row"><span>Mode:</span>' +
        '<button class="ms3d-btn ms3d-mode" data-mode="translate">Move</button>' +
        '<button class="ms3d-btn ms3d-mode" data-mode="rotate">Rotate</button>' +
        '<button class="ms3d-btn ms3d-mode" data-mode="scale">Scale</button></div>',
      '<div class="ms3d-row"><span>t:</span>' +
        '<button class="ms3d-btn" id="ms3d-prev" title="Previous keyframe">◀</button>' +
        '<span class="ms3d-t-value" id="ms3d-t">0.000</span>' +
        '<button class="ms3d-btn" id="ms3d-next" title="Next keyframe">▶</button>' +
        '<button class="ms3d-btn ms3d-btn-primary" id="ms3d-add">+ Keyframe (K)</button>' +
        '<button class="ms3d-btn" id="ms3d-del">Delete</button></div>',
      '<div class="ms3d-row"><span>Auto:</span>' +
        '<button class="ms3d-btn" id="ms3d-auto">Preview off</button>' +
        '<button class="ms3d-btn" id="ms3d-import">Import JSON</button>' +
        '<button class="ms3d-btn" id="ms3d-export">Export JSON</button></div>',
      '<div class="ms3d-row"><span>Edit:</span>' +
        '<button class="ms3d-btn" id="ms3d-undo" title="Undo (Ctrl+Z)">Undo</button>' +
        '<button class="ms3d-btn" id="ms3d-redo" title="Redo (Ctrl+Y)">Redo</button></div>',
      '<div class="ms3d-row"><span>Env:</span>' +
        '<label class="ms3d-env-label" title="Environment light"><span class="ms3d-dim">Light</span>' +
        '<input id="ms3d-env-light" type="range" min="0" max="3" step="0.05" value="1" class="ms3d-input-range">' +
        '<input id="ms3d-env-light-val" type="number" step="0.05" min="0" max="3" value="1" class="ms3d-input-num"></label>' +
        '<label class="ms3d-env-label" title="Environment tint"><span class="ms3d-dim">Color</span>' +
        '<input id="ms3d-env-color" type="color" value="#ffffff" class="ms3d-input-color"></label></div>',
      '<div class="ms3d-help">Scroll to a progress → position model/lights → K. Click diamond to scrub.</div>'
    ].join('');
    wrap.appendChild(bar);

    panelBody = document.createElement('div');
    panelBody.className = 'ms3d-panel ms3d-panel-body';
    wrap.appendChild(panelBody);

    var tl = document.createElement('div');
    tl.className = 'ms3d-panel ms3d-timeline';
    tl.innerHTML = '<div class="ms3d-tl-handle" id="ms3d-tl-handle" title="Drag to move">⠿</div><div class="ms3d-tl-stage"><div class="ms3d-track"></div><div class="ms3d-playhead" id="ms3d-playhead"></div><div class="ms3d-diamonds" id="ms3d-diamonds"></div></div>';
    wrap.appendChild(tl);
    diamondsEl = document.getElementById('ms3d-diamonds');
    playheadEl = document.getElementById('ms3d-playhead');
    makeDraggable(bar, document.getElementById('ms3d-bar-handle'));
    makeDraggable(tl, document.getElementById('ms3d-tl-handle'));

    exportModal = document.createElement('div');
    exportModal.className = 'ms3d-modal';
    exportModal.innerHTML = '<div class="ms3d-modal-card"><div class="ms3d-modal-head"><div class="ms3d-modal-title">Keyframes JSON</div><button class="ms3d-modal-close" id="ms3d-export-close">Close</button></div><textarea class="ms3d-textarea" id="ms3d-export-text" spellcheck="false"></textarea><div class="ms3d-actions"><button class="ms3d-btn ms3d-btn-primary" id="ms3d-export-copy">Copy</button></div></div>';
    wrap.appendChild(exportModal);
    exportText = document.getElementById('ms3d-export-text');
    document.getElementById('ms3d-export-close').addEventListener('click', function () {
      exportModal.classList.remove('on');
    });
    document.getElementById('ms3d-export-copy').addEventListener('click', function () {
      var text = exportText.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () { legacyCopy(exportText); });
      } else {
        legacyCopy(exportText);
      }
    });

    importModal = document.createElement('div');
    importModal.className = 'ms3d-modal';
    importModal.innerHTML = '<div class="ms3d-modal-card"><div class="ms3d-modal-head"><div class="ms3d-modal-title">Import keyframes</div><button class="ms3d-modal-close" id="ms3d-import-close">Close</button></div><textarea class="ms3d-textarea" id="ms3d-import-text" spellcheck="false" placeholder="Paste JSON from Export"></textarea><div class="ms3d-actions"><button class="ms3d-btn ms3d-btn-primary" id="ms3d-import-apply">Apply</button><span class="ms3d-err" id="ms3d-import-err"></span></div></div>';
    wrap.appendChild(importModal);
    importText = document.getElementById('ms3d-import-text');
    document.getElementById('ms3d-import-close').addEventListener('click', function () {
      importModal.classList.remove('on');
    });
    document.getElementById('ms3d-import-apply').addEventListener('click', importKeyframes);

    document.getElementById('ms3d-add').addEventListener('click', addKeyframe);
    document.getElementById('ms3d-del').addEventListener('click', deleteActiveKeyframe);
    document.getElementById('ms3d-prev').addEventListener('click', function () { jumpKeyframe(-1); });
    document.getElementById('ms3d-next').addEventListener('click', function () { jumpKeyframe(1); });
    document.getElementById('ms3d-export').addEventListener('click', exportKeyframes);
    document.getElementById('ms3d-import').addEventListener('click', openImport);
    document.getElementById('ms3d-undo').addEventListener('click', undo);
    document.getElementById('ms3d-redo').addEventListener('click', redo);

    var envLightEl = document.getElementById('ms3d-env-light');
    var envLightValEl = document.getElementById('ms3d-env-light-val');
    var envColorEl = document.getElementById('ms3d-env-color');
    function syncEnv() {
      if (!this.__pushedUndo) { this.__pushedUndo = true; pushUndo(); }
      envLightness = parseFloat(envLightValEl.value) || 1;
      envTint = envColorEl.value;
      applyEnvironment();
      if (activeKf >= 0) updateActiveKeyframe();
    }
    envLightEl.addEventListener('input', function () { envLightValEl.value = this.value; syncEnv.call(this); });
    envLightValEl.addEventListener('input', syncEnv);
    envColorEl.addEventListener('input', syncEnv);
    [envLightEl, envLightValEl, envColorEl].forEach(function (el) {
      el.addEventListener('focus', function () { this.__pushedUndo = false; });
    });
    document.getElementById('ms3d-auto').addEventListener('click', function () {
      autoPlay = !autoPlay;
      this.textContent = autoPlay ? 'Preview on' : 'Preview off';
    });

    Array.prototype.forEach.call(wrap.querySelectorAll('.ms3d-sel'), function (b) {
      b.addEventListener('click', function () { selectObject(b.dataset.sel); });
    });
    Array.prototype.forEach.call(wrap.querySelectorAll('.ms3d-mode'), function (b) {
      b.addEventListener('click', function () {
        if (gizmo) gizmo.setMode(b.dataset.mode);
      });
    });

    gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.addEventListener('dragging-changed', function (e) {
      isDragging = e.value;
      if (e.value) pushUndo();
      if (e.value && lightsMap[selType]) {
        kfLightRotStart = {
          quat: lightsMap[selType].quaternion.clone(),
          offset: lightsMap[selType].target.position.clone().sub(lightsMap[selType].position)
        };
      } else if (!e.value) {
        kfLightRotStart = null;
      }
    });
    gizmo.addEventListener('objectChange', function () {
      if (kfLightRotStart && lightsMap[selType] && gizmo.getMode() === 'rotate') {
        var L = lightsMap[selType];
        var delta = L.quaternion.clone().multiply(kfLightRotStart.quat.clone().invert());
        var off = kfLightRotStart.offset.clone().applyQuaternion(delta);
        L.target.position.copy(L.position).add(off);
        L.quaternion.copy(kfLightRotStart.quat);
      }
      updatePanel();
      if (activeKf >= 0) updateActiveKeyframe();
      if (selType === 'model') {
        ['key', 'fill', 'rim'].forEach(function (n) { if (lightsMap[n].target) lightsMap[n].target.position.copy(model.position); });
      } else if (lightsMap[selType]) {
        refreshLightShadow(lightsMap[selType]);
      }
      updateHelpers();
    });
    gizmo.setSize(0.8);
    scene.add(gizmo);

    ['key', 'fill', 'rim'].forEach(function (n) {
      lightHelpers[n] = new THREE.SpotLightHelper(lightsMap[n]);
      lightHelpers[n].visible = false;
      scene.add(lightHelpers[n]);
    });

    selectObject('model');
    updatePlayhead();
    updatePanel();
    renderDiamonds();
    initialSnapshot = snapshot();

    _keyHandler = onKey;
    window.addEventListener('keydown', _keyHandler);
  }

  function enterEditor() {
    _editorRequested = true;
    if (_state === 'disposed') return;
    if (_state === 'idle' || _state === 'error') { startBootstrap(); return; }
    if (!editorReady) {
      if (model) initEditor();
      return;
    }
    editorOpen = true;
    document.body.classList.add('ms3d-editing');
    if (editorEl) editorEl.style.display = '';
    if (panelBody) panelBody.classList.remove('ms3d-hidden');
    selectObject(selType);
    updatePanel();
    updatePlayhead();
    renderDiamonds();
    if (!_keyHandler) {
      _keyHandler = onKey;
      window.addEventListener('keydown', _keyHandler);
    }
  }

  function exitEditor() {
    if (_state === 'disposed') return;
    if (!editorReady) return;
    editorOpen = false;
    document.body.classList.remove('ms3d-editing');
    if (editorEl) editorEl.style.display = 'none';
    if (gizmo) gizmo.detach();
    if (panelBody) panelBody.classList.add('ms3d-hidden');
    for (var n in lightHelpers) if (lightHelpers[n]) lightHelpers[n].visible = false;
    if (_keyHandler) { window.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  }

  function selectObject(name) {
    selType = name;
    if (editorEl) {
      Array.prototype.forEach.call(editorEl.querySelectorAll('.ms3d-sel'), function (b) {
        b.classList.toggle('ms3d-btn-active', b.dataset.sel === name);
      });
    }
    if (gizmo) {
      if (name === 'model') gizmo.attach(model);
      else if (lightsMap[name]) gizmo.attach(lightsMap[name]);
    }
    if (panelBody) panelBody.classList.remove('ms3d-hidden');
    updateHelpers();
    updatePanel();
  }

  function updateHelpers() {
    for (var n in lightHelpers) {
      if (lightHelpers[n]) {
        lightHelpers[n].visible = (selType === n);
        if (lightHelpers[n].visible) lightHelpers[n].update();
      }
    }
  }

  function closeGizmo() {
    if (gizmo) gizmo.detach();
    if (panelBody) panelBody.classList.add('ms3d-hidden');
    for (var n in lightHelpers) if (lightHelpers[n]) lightHelpers[n].visible = false;
  }

  function makeDraggable(el, handle) {
    var drag = null;
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('button, input')) return;
      var r = el.getBoundingClientRect();
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      el.style.transform = 'none';
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', function (e) {
      if (!drag) return;
      el.style.left = (e.clientX - drag.dx) + 'px';
      el.style.top = (e.clientY - drag.dy) + 'px';
    });
    handle.addEventListener('pointerup', function () {
      drag = null;
    });
  }

  function attachScrub(inp, get, set, sens) {
    var scrub = null;
    inp.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      scrub = { x: e.clientX, val: get(), active: false };
      inp.setPointerCapture(e.pointerId);
    });
    inp.addEventListener('pointermove', function (e) {
      if (!scrub) return;
      var dx = e.clientX - scrub.x;
      if (!scrub.active && Math.abs(dx) > 2) {
        scrub.active = true;
        pushUndo();
        inp.style.cursor = 'ew-resize';
        inp.style.userSelect = 'none';
        e.preventDefault();
      }
      if (scrub.active) {
        set(scrub.val + dx * sens);
        inp.value = get().toFixed(3);
        if (activeKf >= 0) updateActiveKeyframe();
      }
    });
    inp.addEventListener('pointerup', function () {
      scrub = null;
      inp.style.cursor = '';
      inp.style.userSelect = '';
    });
  }

  function updatePanel() {
    if (!panelBody) return;
    var obj = selType === 'model' ? model : (lightsMap[selType] || null);
    if (!obj) return;
    var bindings = [];
    if (selType === 'model') {
      bindings.push(['Pos X', function () { return obj.position.x; }, function (v) { obj.position.x = v; }, 0.01]);
      bindings.push(['Pos Y', function () { return obj.position.y; }, function (v) { obj.position.y = v; }, 0.01]);
      bindings.push(['Pos Z', function () { return obj.position.z; }, function (v) { obj.position.z = v; }, 0.01]);
      bindings.push(['Rot X °', function () { return THREE.MathUtils.radToDeg(obj.rotation.x); }, function (v) { obj.rotation.x = THREE.MathUtils.degToRad(v); }, 0.2]);
      bindings.push(['Rot Y °', function () { return THREE.MathUtils.radToDeg(obj.rotation.y); }, function (v) { obj.rotation.y = THREE.MathUtils.degToRad(v); }, 0.2]);
      bindings.push(['Rot Z °', function () { return THREE.MathUtils.radToDeg(obj.rotation.z); }, function (v) { obj.rotation.z = THREE.MathUtils.degToRad(v); }, 0.2]);
    } else {
      bindings.push(['Pos X', function () { return obj.position.x; }, function (v) { obj.position.x = v; refreshLightShadow(obj); }, 0.01]);
      bindings.push(['Pos Y', function () { return obj.position.y; }, function (v) { obj.position.y = v; refreshLightShadow(obj); }, 0.01]);
      bindings.push(['Pos Z', function () { return obj.position.z; }, function (v) { obj.position.z = v; refreshLightShadow(obj); }, 0.01]);
      bindings.push(['Intensity', function () { return obj.intensity; }, function (v) { obj.intensity = v; }, 0.005]);
      bindings.push(['Angle °', function () { return THREE.MathUtils.radToDeg(obj.angle); }, function (v) { obj.angle = THREE.MathUtils.degToRad(v); refreshLightShadow(obj); }, 0.2]);
      bindings.push(['Penumbra', function () { return obj.penumbra; }, function (v) { obj.penumbra = v; }, 0.01]);
      bindings.push(['Distance', function () { return obj.distance; }, function (v) { obj.distance = Math.max(0, v); refreshLightShadow(obj); }, 0.05]);
      bindings.push(['Decay', function () { return obj.decay; }, function (v) { obj.decay = v; }, 0.01]);
      bindings.push(['Target X', function () { return obj.target ? obj.target.position.x : 0; }, function (v) { if (obj.target) { obj.target.position.x = v; refreshLightShadow(obj); } }, 0.01]);
      bindings.push(['Target Y', function () { return obj.target ? obj.target.position.y : 0; }, function (v) { if (obj.target) { obj.target.position.y = v; refreshLightShadow(obj); } }, 0.01]);
      bindings.push(['Target Z', function () { return obj.target ? obj.target.position.z : 0; }, function (v) { if (obj.target) { obj.target.position.z = v; refreshLightShadow(obj); } }, 0.01]);
    }
    panelBody.innerHTML = '<div class="ms3d-panel-head" id="ms3d-panel-handle"><div class="ms3d-panel-title">' + selType + '</div><div class="ms3d-panel-tools"><button class="ms3d-panel-reset" id="ms3d-panel-reset" title="Reset to starting state">Reset</button><button class="ms3d-close-btn" id="ms3d-close" title="Close gizmo">✕</button></div></div>';
    makeDraggable(panelBody, document.getElementById('ms3d-panel-handle'));
    document.getElementById('ms3d-close').addEventListener('click', closeGizmo);
    document.getElementById('ms3d-panel-reset').addEventListener('click', resetSelection);
    if (selType !== 'model') {
      var crow = document.createElement('div');
      crow.className = 'ms3d-input-row';
      crow.innerHTML = '<span>Color</span>';
      var cinp = document.createElement('input');
      cinp.type = 'color';
      cinp.value = '#' + obj.color.getHexString();
      cinp.className = 'ms3d-input-color-wide';
      cinp.addEventListener('input', function () {
        if (!this.__pushedUndo) { this.__pushedUndo = true; pushUndo(); }
        obj.color.set(this.value);
        if (activeKf >= 0) updateActiveKeyframe();
      });
      cinp.addEventListener('focus', function () { this.__pushedUndo = false; });
      crow.appendChild(cinp);
      panelBody.appendChild(crow);
    }
    bindings.forEach(function (b) {
      var row = document.createElement('div');
      row.className = 'ms3d-input-row';
      row.innerHTML = '<span>' + b[0] + '</span>';
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.step = 'any';
      inp.value = b[1]().toFixed(3);
      inp.addEventListener('focus', function () { this.__pushedUndo = false; });
      inp.addEventListener('input', function () {
        if (!this.__pushedUndo) { this.__pushedUndo = true; pushUndo(); }
        b[2](parseFloat(this.value) || 0);
        if (activeKf >= 0) updateActiveKeyframe();
      });
      inp.addEventListener('change', function () { this.value = b[1]().toFixed(3); });
      attachScrub(inp, b[1], b[2], b[3]);
      row.appendChild(inp);
      panelBody.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------------
  // Keyframe capture / edit operations.
  // ---------------------------------------------------------------------------
  function captureKeyframe() {
    var kf = {
      t: progress,
      modelPos: model.position.clone(),
      modelRot: { x: model.rotation.x, y: model.rotation.y, z: model.rotation.z },
      envLight: envLightness,
      envColor: envTint,
      lights: {}
    };
    for (var n in lightsMap) {
      var L = lightsMap[n];
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

  function addKeyframe() {
    pushUndo();
    var kf = captureKeyframe();
    KEYFRAMES.push(kf);
    KEYFRAMES.sort(function (a, b) { return a.t - b.t; });
    activeKf = KEYFRAMES.indexOf(kf);
    renderDiamonds();
    updatePlayhead();
  }

  function deleteActiveKeyframe() {
    if (activeKf < 0) return;
    pushUndo();
    KEYFRAMES.splice(activeKf, 1);
    activeKf = -1;
    renderDiamonds();
  }

  function selectKeyframe(i) {
    if (!KEYFRAMES.length || i < 0 || i >= KEYFRAMES.length) return;
    activeKf = i;
    var kf = KEYFRAMES[i];
    progress = kf.t;
    if (opts.progressMode === 'manual') {
      setProgress(kf.t);
    } else {
      var total = opts.container.offsetHeight - window.innerHeight;
      window.scrollTo(0, progress * total);
      window.dispatchEvent(new Event('scroll'));
    }
    applyKfState(kf);
    syncEnvControls();
    renderDiamonds();
    updatePanel();
  }

  function jumpKeyframe(dir) {
    if (!KEYFRAMES.length) return;
    if (activeKf < 0) {
      selectKeyframe(dir > 0 ? 0 : KEYFRAMES.length - 1);
    } else {
      selectKeyframe(activeKf + dir);
    }
  }

  function updateActiveKeyframe() {
    if (activeKf < 0) return;
    var t = KEYFRAMES[activeKf].t;
    KEYFRAMES[activeKf] = captureKeyframe();
    KEYFRAMES[activeKf].t = t;
    renderDiamonds();
  }

  // ---------------------------------------------------------------------------
  // Export / Import modals + helpers.
  // ---------------------------------------------------------------------------
  function exportKeyframes() {
    if (!exportModal) return;
    var json = getExportJSON();
    exportText.value = json;
    exportModal.classList.add('on');
    if (opts.onExport) opts.onExport(json);
  }

  function openImport() {
    if (!importModal) return;
    var err = document.getElementById('ms3d-import-err');
    if (err) err.textContent = '';
    importModal.classList.add('on');
    importText.focus();
  }

  function importKeyframes() {
    if (!importModal) return;
    var err = document.getElementById('ms3d-import-err');
    var raw = importText.value.trim();
    if (!raw) { err.textContent = 'Paste JSON first'; return; }
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      err.textContent = 'Invalid JSON: ' + e.message;
      return;
    }
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.keyframes) ? data.keyframes : null);
    if (!list) { err.textContent = 'Expected an array or { keyframes: [...] }'; return; }
    var out = parseKeyframesList(list, function (msg) { err.textContent = msg; });
    if (!out) return;
    pushUndo();
    applyEnvFromData(data);
    KEYFRAMES.length = 0;
    out.forEach(function (kf) { KEYFRAMES.push(kf); });
    activeKf = -1;
    renderDiamonds();
    updatePlayhead();
    updatePanel();
    syncEnvControls();
    importModal.classList.remove('on');
  }

  function legacyCopy(ta) {
    ta.select();
    document.execCommand('copy');
  }

  function renderDiamonds() {
    if (!diamondsEl) return;
    diamondsEl.innerHTML = '';
    KEYFRAMES.forEach(function (kf, i) {
      var d = document.createElement('button');
      d.className = 'ms3d-diamond' + (i === activeKf ? ' ms3d-diamond-active' : '');
      d.style.left = (kf.t * 100) + '%';
      d.title = 't=' + kf.t.toFixed(3);
      d.addEventListener('click', function () {
        selectKeyframe(i);
      });
      diamondsEl.appendChild(d);
    });
  }

  function updatePlayhead() {
    if (playheadEl) playheadEl.style.left = (progress * 100) + '%';
    var tv = document.getElementById('ms3d-t');
    if (tv) tv.textContent = progress.toFixed(3);
    if (editorEl && editorOpen && autoPlay && model) {
      var s = sampleKeyframes(progress);
      if (s && !isDragging) { applyKfState(s); updateHelpers(); }
    }
  }

  function onKey(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) { undo(); e.preventDefault(); return; }
      if ((e.key === 'z' || e.key === 'Z') && e.shiftKey) { redo(); e.preventDefault(); return; }
      if (e.key === 'y' || e.key === 'Y') { redo(); e.preventDefault(); return; }
    }
    if ((e.key === 'k' || e.key === 'K') && !e.repeat) { addKeyframe(); e.preventDefault(); }
    if (e.key === 'Delete' || e.key === 'Backspace') deleteActiveKeyframe();
  }

  // ---------------------------------------------------------------------------
  // Public handle API.
  // ---------------------------------------------------------------------------
  function setProgress(p) {
    if (_state === 'disposed') return;
    progress = Math.max(0, Math.min(1, typeof p === 'number' && isFinite(p) ? p : 0));
    applyProgress();
  }

  function getProgress() {
    return progress;
  }

  function play() {
    startLoop();
  }

  function pause() {
    stopLoop();
  }

  function exportJSON() {
    return getExportJSON();
  }

  function importJSON(str) {
    if (_state === 'disposed' || typeof str !== 'string') return false;
    var data;
    try {
      data = JSON.parse(str);
    } catch (e) {
      return false;
    }
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.keyframes) ? data.keyframes : null);
    if (!list) return false;
    var out = parseKeyframesList(list);
    if (!out) return false;
    pushUndo();
    applyEnvFromData(data);
    KEYFRAMES.length = 0;
    out.forEach(function (kf) { KEYFRAMES.push(kf); });
    activeKf = -1;
    renderDiamonds();
    updatePlayhead();
    updatePanel();
    syncEnvControls();
    return true;
  }

  function dispose() {
    if (_state === 'disposed') return;
    _state = 'disposed';
    _instanceActive = false;
    stopLoop();
    if (_io) _io.disconnect();
    if (_ro) _ro.disconnect();
    if (_keyHandler) { window.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onWinResize);
    if (editorEl && editorEl.parentNode) editorEl.parentNode.removeChild(editorEl);
    editorEl = null;
    editorReady = false;
    editorOpen = false;
    document.body.classList.remove('ms3d-editing');
    if (loaderEl && loaderEl.parentNode) loaderEl.parentNode.removeChild(loaderEl);
    loaderEl = null;
    if (autoCanvas && autoCanvas.parentNode) autoCanvas.parentNode.removeChild(autoCanvas);
    autoCanvas = null;
    if (_madeContainerRelative && opts && opts.container) opts.container.style.position = '';
    if (pmrem) { pmrem.dispose(); pmrem = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null;
    camera = null;
    model = null;
    lightsMap = {};
    lightHelpers = {};
    KEYFRAMES = [];
    _styleUsers -= 1;
    if (_styleUsers <= 0) {
      var st = document.getElementById('ms3d-styles');
      if (st && st.parentNode) st.parentNode.removeChild(st);
      _styleUsers = 0;
    }
  }

  window.ModelStory = { create: create, version: '1.0.0' };
})();
