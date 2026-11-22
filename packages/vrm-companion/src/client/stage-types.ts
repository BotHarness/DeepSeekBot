import type { BotPresentationSnapshot } from '@botharness/ui/panels';
import type { Loading, Problem } from './copy.js';
import type { MotionCommand } from './motion.js';
import type { Mood, Weather } from './room.js';
import type { CharacterShading } from './shading.js';

export type CameraView = 'desk' | 'room' | 'portrait';
export interface SceneState {
  phase: string;
  wandering: boolean;
  ready: boolean;
}
export interface SceneChoices {
  camera: CameraView;
  mood: Mood;
  weather: Weather;
  shading: CharacterShading;
  effects: boolean;
  tour?: boolean;
}
export interface StageCallbacks {
  loading(value: Loading): void;
  error(value: Problem): void;
  changed(state: SceneState): void;
  poster(url: string): void;
}
export interface Stage {
  update(snapshot: BotPresentationSnapshot): void;
  command(command: MotionCommand): void;
  camera(view: CameraView): void;
  mood(value: Mood): void;
  weather(value: Weather): void;
  effects(value: boolean): void;
  tour(value: boolean): void;
  shading(value: CharacterShading): void;
  dispose(): void;
}
