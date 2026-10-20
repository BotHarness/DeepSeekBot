import type { Mood, Weather } from './room.js';
import type { CharacterShading } from './shading.js';
import type { CameraView, SceneChoices, SceneState, Stage } from './stage.js';
import { forgetModel, saveModel } from './library.js';

export type CustomModel = { name: string; url: string };

export type PanelState = SceneChoices & {
  scene: SceneState;
  model: CustomModel | undefined;
  kept: boolean;
  loading: string;
  error: string;
  failure: string;
  revision: number;
};

const DEFAULT_CHOICES: SceneChoices = {
  camera: 'desk',
  mood: 'auto',
  weather: 'clear',
  shading: 'mtoon',
  effects: true,
};

const remembered = new Map<string, SceneChoices>();
const models = new Map<string, CustomModel>();
const looked = new Set<string>();
const panels = new Map<string, PanelControls>();

export class PanelControls {
  stage: Stage | undefined;
  #state: PanelState;
  #listeners = new Set<() => void>();

  constructor(readonly botId: string) {
    this.#state = {
      ...(remembered.get(botId) ?? DEFAULT_CHOICES),
      scene: { phase: 'seated', wandering: false, ready: false },
      model: models.get(botId),
      kept: true,
      loading: '',
      error: '',
      failure: '',
      revision: 0,
    };
  }

  read = () => this.#state;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  set(change: Partial<PanelState>) {
    this.#state = { ...this.#state, ...change };
    for (const listener of this.#listeners) listener();
  }

  choices(): SceneChoices {
    return remembered.get(this.botId) ?? DEFAULT_CHOICES;
  }

  #remember(change: Partial<SceneChoices>) {
    remembered.set(this.botId, { ...this.choices(), ...change });
    this.set(change);
  }

  camera(value: CameraView) {
    this.stage?.tour(false);
    this.stage?.camera(value);
    this.#remember({ camera: value, tour: false });
  }

  tour(value: boolean) {
    this.stage?.tour(value);
    if (!value) this.stage?.camera(this.#state.camera);
    this.#remember({ tour: value });
  }

  mood(value: Mood) {
    this.stage?.mood(value);
    this.#remember({ mood: value });
  }

  weather(value: Weather) {
    this.stage?.weather(value);
    this.#remember({ weather: value });
  }

  effects(value: boolean) {
    this.stage?.effects(value);
    this.#remember({ effects: value });
  }

  shading(value: CharacterShading) {
    this.stage?.shading(value);
    this.#remember({ shading: value });
  }

  retry() {
    this.set({ revision: this.#state.revision + 1 });
  }

  known() {
    return looked.has(this.botId);
  }

  restore(stored: { name: string; file: Blob } | undefined) {
    looked.add(this.botId);
    if (stored && !models.has(this.botId))
      models.set(this.botId, { name: stored.name, url: URL.createObjectURL(stored.file) });
    this.set({ model: models.get(this.botId) });
  }

  #use(next: CustomModel | undefined) {
    const previous = models.get(this.botId);
    if (previous) URL.revokeObjectURL(previous.url);
    if (next) models.set(this.botId, next);
    else models.delete(this.botId);
    for (const panel of panels.values())
      if (panel.botId === this.botId) {
        panel.set({ model: next });
        panel.retry();
      }
  }

  pick(file: File) {
    this.#use({ name: file.name, url: URL.createObjectURL(file) });
    this.set({ kept: true });
    void saveModel(this.botId, { name: file.name, file }).then((kept) => this.set({ kept }));
  }

  reset() {
    this.#use(undefined);
    this.set({ kept: true });
    void forgetModel(this.botId);
  }
}

export function panelControls(key: string, botId: string): PanelControls {
  const existing = panels.get(key);
  if (existing && existing.botId === botId) return existing;
  const created = new PanelControls(botId);
  panels.set(key, created);
  return created;
}
