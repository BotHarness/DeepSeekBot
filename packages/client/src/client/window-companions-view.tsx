import { useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  Switch,
  IconPinFillRegular,
  IconPinOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { NumberStepper } from './ds/number-stepper.js';
import { SettingsRow } from './ds/settings-row.js';
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
  return (
    <>
      <SettingsRow
        title={t('companion.speechSound')}
        description={t('companion.speechSoundHint')}
        control={
          <Switch
            checked={state.speechSound}
            onChange={(enabled: boolean) => companion.configureSpeechSound(enabled)}
            disabled={!state.ready}
            label={t('companion.speechSound')}
          />
        }
      />
      <SettingsRow
        title={t('companion.retention')}
        description={t('companion.capacityHint')}
        control={
          <NumberStepper
            label={t('companion.retention')}
            value={state.capacity.retention}
            min={1}
            max={100}
            disabled={!state.ready}
            decreaseLabel={t('common.decrease')}
            increaseLabel={t('common.increase')}
            onChange={(retention) =>
              companion.configureCapacity({ layers: state.capacity.layers, retention })
            }
          />
        }
      />
    </>
  );
}
