/**
 * Public option/result types for ModelStory.
 *
 * Pure types only — no `three` imports, so this file can be consumed anywhere
 * without pulling in three's type graph. Keep the exported names and field
 * shapes exactly as declared; the library and any consumers depend on them.
 */
interface Vec3 {
    x: number;
    y: number;
    z: number;
}
interface Rot3 {
    x: number;
    y: number;
    z: number;
}
interface CameraOptions {
    fov: number;
    azimuthDeg: number;
    elevationDeg: number;
    fitPadding: number;
    mobileDistScale: number;
}
interface EnvironmentOptions {
    light: number;
    color: string;
}
interface LightOptions {
    color?: number | string;
    intensity?: number;
    position?: [number, number, number];
    angleDeg?: number;
    penumbra?: number;
    distance?: number;
    decay?: number;
}
interface LightsOptions {
    key?: LightOptions;
    fill?: LightOptions;
    rim?: LightOptions;
}
interface DisableOnOptions {
    mobile?: boolean;
    reducedMotion?: boolean;
}
type ProgressMode = 'scroll' | 'manual';
type SkipReason = 'mobile' | 'reduced-motion' | 'no-webgl';
interface ModelStoryOptions {
    container: Element | string;
    canvas?: Element | null;
    model: string;
    keyframes?: string | object | unknown[] | null;
    editor?: 'auto' | boolean;
    progressMode?: ProgressMode;
    accentColor?: string;
    loader?: boolean;
    disableOn?: DisableOnOptions;
    spin?: boolean;
    camera?: Partial<CameraOptions>;
    environment?: Partial<EnvironmentOptions>;
    lights?: LightsOptions;
    onProgress?: ((p01: number) => void) | null;
    onLoad?: (() => void) | null;
    onError?: ((err: unknown) => void) | null;
    onSkip?: ((reason: SkipReason) => void) | null;
    onExport?: ((jsonString: string) => void) | null;
}
interface ModelStoryHandle {
    setProgress(p: number): void;
    getProgress(): number;
    play(): void;
    pause(): void;
    enterEditor(): void;
    exitEditor(): void;
    exportJSON(): string;
    importJSON(jsonString: string): boolean;
    dispose(): void;
}

declare const version = "1.0.0";
declare function create(options: ModelStoryOptions): Promise<ModelStoryHandle>;

export { type CameraOptions, type DisableOnOptions, type EnvironmentOptions, type LightOptions, type LightsOptions, type ModelStoryHandle, type ModelStoryOptions, type ProgressMode, type Rot3, type SkipReason, type Vec3, create, version };
