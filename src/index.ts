import { ModelStory } from './model-story';
import type { ModelStoryOptions, ModelStoryHandle } from './types';

export const version = '1.0.0';

export function create(options: ModelStoryOptions): Promise<ModelStoryHandle> {
  return ModelStory.create(options);
}

export type {
  Vec3,
  Rot3,
  CameraOptions,
  EnvironmentOptions,
  LightOptions,
  LightsOptions,
  DisableOnOptions,
  ProgressMode,
  SkipReason,
  ModelStoryOptions,
  ModelStoryHandle,
} from './types';
