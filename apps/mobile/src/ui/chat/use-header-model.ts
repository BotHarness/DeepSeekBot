import { loadModelPlanState } from '@botharness/host-client/model-plans';
import { useMemo, useState, type RefCallback } from 'react';
import type { ViewInstance } from 'react-native';

import {
  botSettings,
  type BotModel,
  type BotSettings,
  type Loadable,
} from '@botharness/host-client/bot-settings';
import type { HostClient } from '@botharness/host-client/client';
import { useMounted } from '../mounted';
import { headerModel, type HeaderModel } from './composer-labels';

export function useHeaderModel(
  client: HostClient | undefined,
  slug: string | undefined,
  focused: boolean,
  refresh: string | undefined,
): { model: HeaderModel | undefined; mount: RefCallback<ViewInstance> } {
  const settings = useMemo(
    () => (client === undefined || slug === undefined ? undefined : botSettings(client, slug)),
    [client, slug],
  );
  const [state, setState] = useState<{ key: BotSettings; model: Loadable<BotModel> }>();
  const mount = useMounted<ViewInstance>(() => {
    if (client === undefined || slug === undefined || settings === undefined || !focused) return;
    let current = true;
    let generation = 0;
    void settings.loadModel().then(
      (value) => {
        if (current) setState({ key: settings, model: { status: 'ready', value } });
      },
      (error: unknown) => {
        if (current) setState({ key: settings, model: { status: 'failed', error: String(error) } });
      },
    );
    const stop = client.onResource?.((_resource, change) => {
      if (change?.resource !== 'bot-context' || change.slug !== slug) return;
      const revision = ++generation;
      void loadModelPlanState(client, slug).then(
        ({ currentTarget }) => {
          if (!current || revision !== generation) return;
          setState((snapshot) => {
            if (snapshot?.key !== settings || snapshot.model.status !== 'ready') return snapshot;
            const { currentTarget: _previous, ...value } = snapshot.model.value;
            return {
              key: settings,
              model: {
                status: 'ready',
                value: {
                  ...value,
                  ...(currentTarget === undefined ? {} : { currentTarget }),
                },
              },
            };
          });
        },
        () => undefined,
      );
    });
    return () => {
      current = false;
      stop?.();
    };
  }, [client, slug, settings, focused, refresh]);
  return {
    model: state !== undefined && state.key === settings ? headerModel(state.model) : undefined,
    mount,
  };
}
