# ModelStory

A zero-build Three.js plugin that turns a tall scroll section into a choreographed 3D product reveal — and ships a visual **keyframe editor** so designers can author the moves directly in the browser, no code required.

Self-contained: three.js r160 is loaded from the jsDelivr CDN by the library itself. Drop one `<script>` tag in, point it at a GLB, scroll, and the model performs.

![demo](https://img.shields.io/badge/three.js-r160-000000)

## Features

- **Scroll-driven playback** — scroll position maps to progress `0 → 1`, keyframes interpolate smoothly (position, rotation, environment light/tint, per-key light rigs, and the camera when a keyframe pins one).
- **Author mode in the browser** — add `?edit=1` and get a full keyframe timeline with a TransformControls gizmo, numeric scrubbers, undo/redo, and import/export.
- **Built-in studio lighting** — three spotlights (`key` / `fill` / `rim`) with soft shadows, an ACES filmic tone mapping, and a PMREM RoomEnvironment that can be tinted and brightened per keyframe.
- **Designer-friendly output** — keyframes export as plain JSON that any integration can load; the demo's overlay captions are driven purely by the `onProgress` callback.
- **Sensible fallbacks** — auto-skips on mobile / `prefers-reduced-motion` / no WebGL (calls `onSkip`), so the page never breaks.
- **One instance per page**, fully disposable — `dispose()` tears down WebGL, listeners, injected styles, and canvas.

## Quick start

```html
<script src="model-story.js"></script>

<div id="hero"></div>

<script>
  var handle = await ModelStory.create({
    container: document.getElementById('hero'),
    model: 'assets/truck.glb',
    keyframes: 'positions.json'
  });
</script>
```

Make `#hero` tall (e.g. `height: 420vh`) and sticky-wrap your stage if you want it pinned to the viewport while you scroll. When scroll progress crosses your keyframes, the model moves.

Run the included demo (`demo.html`) with a local server, or open it with `?edit=1` to jump straight into author mode.

## Options

All optional unless marked. Everything below has a sensible default.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `container` | `Element` | — **(required)** | The scroll section. Its scroll position drives progress `0 → 1`. |
| `canvas` | `Element` | auto-created | Canvas to render into; created and appended to `container` if omitted. |
| `model` | `string` | — **(required)** | URL of the GLB model. |
| `keyframes` | `string \| object \| array` | `null` | JSON URL, inline object, or plain array of keyframes. |
| `editor` | `'auto' \| boolean` | `'auto'` | `'auto'` enables author mode when the URL has `?edit=1`. |
| `progressMode` | `'scroll' \| 'manual'` | `'scroll'` | `'manual'` disables the scroll listener; drive with `setProgress()`. |
| `accentColor` | `string` | `'#fa7c1d'` | Accent for the built-in loader and editor UI. |
| `loader` | `boolean` | `true` | Show the built-in loading overlay with progress bar. |
| `disableOn` | `{ mobile, reducedMotion }` | both `true` | Skip WebGL and call `onSkip` when matched. |
| `spin` | `boolean` | `true` | Turntable auto-rotation fallback when there are no keyframes. |
| `camera` | `object` | see below | `{ fov:40, azimuthDeg:38, elevationDeg:9, fitPadding:1.06, mobileDistScale:1.8 }`. |
| `environment` | `object` | `{ light:1, color:'#000000' }` | Initial environment intensity and tint. |
| `lights` | `object` | defaults | Per-light overrides for `key` / `fill` / `rim` spotlights. |
| `onProgress(p01)` | `function` | — | Called on every frame with progress. Drive your HTML overlays here. |
| `onLoad()` | `function` | — | Model loaded and rendered. |
| `onError(err)` | `function` | — | Any load/render failure. |
| `onSkip(reason)` | `function` | — | `'mobile' \| 'reduced-motion' \| 'no-webgl'`. |
| `onExport(jsonString)` | `function` | — | Fired when the editor exports JSON. |

## Handle API

`ModelStory.create(...)` resolves to a handle:

```js
handle.setProgress(0.5);          // jump to 50%
handle.getProgress();             // read current progress
handle.play();                    // force the render loop
handle.pause();                   // stop the render loop
handle.enterEditor();             // open author mode
handle.exitEditor();              // close author mode
handle.exportJSON();              // dump keyframes as JSON string
handle.importJSON(jsonString);    // load keyframes, returns boolean
handle.dispose();                 // tear everything down
```

## Author mode

Designers keyframe the whole scene visually — no code.

1. Open your page with `?edit=1` (or click the **Author mode** link, or call `handle.enterEditor()`).
2. Scroll to the position you want to choreograph.
3. Select **Model** or a light (`Key` / `Fill` / `Rim`), then move / rotate / scale with the gizmo — or scrub the numeric fields.
4. To move the **camera**, select **Camera** — it becomes a gizmo-editable object like the model: drag / rotate it directly (or edit its numeric fields), press **`Numpad 0`** to look through it, and press **`K`** to pin the pose onto the keyframe at that progress.
5. Press **`K`** to drop a keyframe at the current progress.
6. Click the diamonds on the timeline to jump between keyframes.
7. **Export JSON**, save it, and reference it via the `keyframes` option in your integration.

Shortcuts: `K` add keyframe · `Delete` / `Backspace` delete · `Ctrl+Z` undo · `Ctrl+Shift+Z` / `Ctrl+Y` redo · `Numpad 1`/`3`/`7` front/right/top views (hold `Ctrl` for back/left/bottom) · `Numpad 5` perspective/ortho · `Numpad0` camera view.

### Viewport navigation

While in author mode you can freely inspect the scene (Blender-style):

- **Orbit** — middle-mouse drag, or Alt+left-drag (turntable).
- **Pan** — Shift+middle-drag, or Alt+Shift+left-drag.
- **Zoom** — mouse wheel (1.2× per notch, Blender's step), or Ctrl+middle-drag.
- **Snap back** — press **`Numpad 0`** to return to the authored camera view (or the active keyframe's pinned camera, when it has one).
- **View snaps** — **`Numpad 1`** front, **`Numpad 3`** right, **`Numpad 7`** top; hold **`Ctrl`** for the opposite side (back / left / bottom), Blender-style.
- **Perspective / ortho** — **`Numpad 5`** toggles the projection; orbit, pan, and zoom still work, and the ortho frustum refits the model at whatever distance you're viewing.
- **Camera visual** — while navigating, a wireframe of the authored camera shows where it sits in the scene (like Blender's camera object); it disappears when you snap back.
- **Authoring the camera** — select **Camera** to edit it: a camera object appears at the pinned (or authored) pose with a gizmo. Drag / rotate the gizmo (or scrub the Pos/Target fields) to aim — the viewport stays where it is so you always see the camera and gizmo. Press **`Numpad 0`** to look through the camera, then **`K`** to pin that pose to the keyframe at the current progress. During playback the camera is interpolated between pinned keyframes, falling back to the fixed authored framing elsewhere.

While you are navigating, the camera stays exactly where you left it — scrolling or scrubbing the timeline won't move it (the authored framing is only re-asserted on `Numpad 0` or when you leave author mode). Note that in author mode the wheel over the canvas zooms instead of scrolling the page; scrub progress with the timeline diamonds, the ◀ ▶ buttons, PgUp/PgDn, or the page scrollbar instead.

While author mode is active, the library adds the class `ms3d-editing` to `<body>` so your own UI chrome can be dimmed or ignored.

## Keyframes JSON

```jsonc
{
  "version": 1,
  "env": { "light": 1, "color": "#000000" },
  "keyframes": [
    {
      "t": 0.35,                          // scroll progress 0..1
      "modelPos": { "x": 0, "y": 0, "z": 1 },
      "modelRot": { "x": 0, "y": 2.3, "z": 0 },
      "camPos":    { "x": 0, "y": 0.9, "z": 7.4 },   // optional — pins the camera
      "camTarget": { "x": 0, "y": -0.3, "z": 0 },   //   (position + look-at point)
      "envLight": 1,
      "envColor": "#000000",
      "lights": {
        "key": {
          "pos":        { "x": 0.4, "y": 0, "z": 2.4 },
          "intensity":  1.7,
          "color":      "#fff1e0",
          "angle":      0.9,
          "penumbra":   0.3,
          "distance":   0,
          "decay":      1.5,
          "target":     { "x": 0.2, "y": -0.5, "z": 1.3 }
        }
        // "fill", "rim" ...
      }
    }
    // ...
  ]
}
```

- Keyframes are sorted by `t`; between two keyframes every value is lerped (colors too).
- A keyframe can pin the camera with optional `camPos` / `camTarget` (position + look-at point). The camera is interpolated between keyframes that both pin one; keyframes (or segments) without them use the fixed authored framing from the `camera` option.
- `keyframes` accepts an array or a `{ keyframes: [...] }` object, and legacy `truckPos` / `truckRot` keys are still read for backward compatibility.
- Exports include **both** `modelPos` and legacy `truckPos` keys, so exports stay interchangeable with older integrations.

## Files

```
model-story.js        the library (one file, self-contained)
demo.html             self-contained demo page
demo_positions.json   example keyframes (truck + light poses)
assets/               the GLB model
```

## Requirements

- A browser with WebGL (a static server for the demo; the model and keyframes are fetched over HTTP).
- Network access to `cdn.jsdelivr.net` unless the host page already maps `three` and `three/addons/` in its own import map.
- No bundler, no npm install, no build step.