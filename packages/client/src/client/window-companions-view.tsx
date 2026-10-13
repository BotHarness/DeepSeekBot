import { useId, useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  Input,
  Button,
  Switch,
  IconPinFillRegular,
  IconPinOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from './locale.js';
import type { WindowCompanions } from './window-companions.js';
import { WindowCompanionView, type WindowCompanionViewProps } from './window-companion-view.js';
import { CompanionBubbles } from './companion-bubbles.js';
import { CompanionFrames } from './companion-frames.js';
import { CompanionSound } from './companion-sound.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotModePrefs } from './bot-mode-prefs.js';
import { MessageDeveloperMode } from './message-developer-mode.js';

const subscribeWithoutPrefs = (): (() => void) => () => {};

export function CompanionPin({
  companion,
  botId,
  name,
  t,
}: {
  companion: WindowCompanions;
  botId: string;
  name?: string | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const state = useSyncExternalStore(companion.subscribe, companion.getSnapshot);
  const selected = companion.get(botId) !== undefined;
  const label = t(selected ? 'companion.remove' : 'companion.show');
  return (
    <button
      type="button"
      className="bh-companion-pin"
      disabled={!state.ready}
      aria-label={`${label} · ${name ?? botId}`}
      title={label}
      aria-pressed={selected}
      data-companion-pin={botId}
      onClick={() => {
        if (selected) companion.remove(botId);
        else companion.select(botId);
      }}
    >
      {selected ? <IconPinFillRegular size={16} /> : <IconPinOutlineRegular size={16} />}
    </button>
  );
}

export function WindowCompanionsView({
  companion,
  prefs,
  ...props
}: Omit<WindowCompanionViewProps, 'companion'> & {
  companion: WindowCompanions;
  prefs?: Pick<BotModePrefs, 'source'> | undefined;
}): ReactElement {
  const state = useSyncExternalStore(companion.subscribe, companion.getSnapshot);
  const developerMode = useSyncExternalStore(
    prefs?.source.subscribe ?? subscribeWithoutPrefs,
    () => prefs?.source.getSnapshot().developerMode ?? false,
    () => false,
  );
  const [bubbles] = useState(() => new CompanionBubbles());
  const [frames] = useState(() => new CompanionFrames());
  const [sound] = useState(() => new CompanionSound());
  const audioMount = useMountedResource<HTMLSpanElement>(() => {
    const sync = () => {
      const state = companion.getSnapshot();
      sound.setEnabled(state.speechSound && state.companions.length > 0);
    };
    const unlock = (event: Event) => {
      if (event.isTrusted && !document.hidden) sound.unlock();
    };
    const visibility = () => {
      if (document.hidden) sound.stop();
    };
    sync();
    const unsubscribe = companion.subscribe(sync);
    document.addEventListener('click', unlock);
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      unsubscribe();
      document.removeEventListener('click', unlock);
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visibility);
      sound.dispose();
    };
  }, [companion, sound]);
  return (
    <MessageDeveloperMode.Provider value={developerMode}>
      <span hidden ref={audioMount} />
      {state.companions.map((child) => (
        <WindowCompanionView
          key={child.getSnapshot().selection?.botId}
          {...props}
          companion={child}
          bubbles={bubbles}
          frames={frames}
          sound={sound}
          onRemove={(botId) => companion.remove(botId)}
        />
      ))}
    </MessageDeveloperMode.Provider>
  );
}

export function CompanionSettings({
  companion,
  t,
}: {
  companion: WindowCompanions;
  t: BotHarnessTranslate;
}): ReactElement {
  const state = useSyncExternalStore(companion.subscribe, companion.getSnapshot);
  const id = useId();
  const [error, setError] = useState(false);
  return (
    <>
      <div className="bh-settings-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-title">{t('companion.speechSound')}</div>
          <div className="bh-settings-row-desc">{t('companion.speechSoundHint')}</div>
        </div>
        <Switch
          checked={state.speechSound}
          onChange={(enabled: boolean) => companion.configureSpeechSound(enabled)}
          disabled={!state.ready}
          label={t('companion.speechSound')}
        />
      </div>
      <form
        className="bh-settings-row bh-companion-settings"
        key={`${state.capacity.layers}:${state.capacity.retention}`}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const layers = Number(data.get('layers'));
          const retention = Number(data.get('retention'));
          if (
            !Number.isInteger(layers) ||
            layers < 1 ||
            layers > 10 ||
            !Number.isInteger(retention) ||
            retention < 1 ||
            retention > 100
          ) {
            setError(true);
            return;
          }
          companion.configureCapacity({ layers, retention });
          setError(false);
        }}
      >
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-title">{t('companion.settings')}</div>
          <div className="bh-settings-row-desc">{t('companion.capacityHint')}</div>
          {error ? <div role="alert">{t('companion.capacityError')}</div> : null}
        </div>
        <div className="bh-companion-capacity-controls">
          <label htmlFor={`${id}-layers`}>
            {t('companion.layers')}
            <Input
              id={`${id}-layers`}
              name="layers"
              type="number"
              min={1}
              max={10}
              step={1}
              required
              defaultValue={state.capacity.layers}
              disabled={!state.ready}
            />
          </label>
          <label htmlFor={`${id}-retention`}>
            {t('companion.retention')}
            <Input
              id={`${id}-retention`}
              name="retention"
              type="number"
              min={1}
              max={100}
              step={1}
              required
              defaultValue={state.capacity.retention}
              disabled={!state.ready}
            />
          </label>
          <Button type="submit" size="sm" variant="primary" disabled={!state.ready}>
            {t('companion.save')}
          </Button>
        </div>
      </form>
    </>
  );
}
