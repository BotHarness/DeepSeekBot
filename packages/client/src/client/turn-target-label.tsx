import * as stylex from '@stylexjs/stylex';
import { useCallback, useMemo, useState } from 'react';

import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import { ink, space, type } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BridgeActions } from './actions.js';
import type {
  ModelCatalogEntryView,
  ModelCatalogGroupView,
  SessionTranscriptItem,
} from './bridge.js';
import { useMountedResource } from './mounted-resource.js';
import { TargetBrandIcon } from './model-brand.js';
import { routingGroupEngineCopy } from './session-engine.js';

const styles = stylex.create({
  path: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
    color: ink.tertiary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
  },
  target: { display: 'inline-flex', alignItems: 'center', gap: space.x1 },
});

export function TurnTargetLabel({
  targets,
  catalog,
  t,
}: {
  targets: readonly TurnTarget[] | undefined;
  catalog: TurnTargetCatalog;
  t: BotHarnessTranslate;
}) {
  if (targets === undefined) return null;
  const copy = routingGroupEngineCopy(t);
  return (
    <span data-turn-targets="" {...stylex.props(styles.path)}>
      {targets.map((target, index) => {
        const label = turnTargetLabel(target, catalog, copy);
        return (
          <span key={index} title={label.name} {...stylex.props(styles.target)}>
            {index === 0 ? null : <span>→</span>}
            <TargetBrandIcon {...label} size={14} externalLabel={t('engine.externalLabel')} />
            <span>{[label.short, label.effort].filter(Boolean).join(' · ')}</span>
          </span>
        );
      })}
    </span>
  );
}

const CATALOG_RETRIES = 3;
const CATALOG_RETRY_MS = 5_000;
const cachedModelCatalogs = new WeakMap<BridgeActions, ReturnType<BridgeActions['modelCatalog']>>();

function readCachedModelCatalog(actions: BridgeActions) {
  const cached = cachedModelCatalogs.get(actions);
  if (cached !== undefined) return cached;
  const request = actions.modelCatalog().catch((error: unknown) => {
    cachedModelCatalogs.delete(actions);
    throw error;
  });
  cachedModelCatalogs.set(actions, request);
  return request;
}

export function useTurnTargetModels(
  actions: BridgeActions,
  needed: boolean,
  freshness: 'fresh' | 'cached' = 'fresh',
) {
  const [catalog, setCatalog] = useState<{
    host: BridgeActions;
    models: ModelCatalogEntryView[];
    groups: ModelCatalogGroupView[];
  }>();
  const current = catalog?.host === actions ? catalog : undefined;
  const [attempt, setAttempt] = useState(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (!needed || current !== undefined || actions.modelCatalog === undefined) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const request =
      freshness === 'cached' ? readCachedModelCatalog(actions) : actions.modelCatalog();
    void request.then(
      ({ models, groups }) => {
        if (active) setCatalog({ host: actions, models, groups: groups ?? [] });
      },
      () => {
        if (active && attempt < CATALOG_RETRIES)
          retry = setTimeout(
            () => setAttempt((value) => value + 1),
            CATALOG_RETRY_MS * 2 ** attempt,
          );
      },
    );
    return () => {
      active = false;
      if (retry !== undefined) clearTimeout(retry);
    };
  }, [actions, needed, current, attempt, freshness]);
  return { models: current?.models, groups: current?.groups, mount };
}

export function useTurnTargetEngines<T extends Element>(actions: BridgeActions, needed: boolean) {
  const [catalog, setCatalog] = useState<{
    host: BridgeActions;
    engines: Awaited<ReturnType<BridgeActions['routingGroupEngines']>>;
  }>();
  const engines = catalog?.host === actions ? catalog.engines : undefined;
  const [attempt, setAttempt] = useState(0);
  const mount = useMountedResource<T>(() => {
    if (!needed || engines !== undefined || actions.routingGroupEngines === undefined) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    void actions.routingGroupEngines().then(
      (engines) => {
        if (active) setCatalog({ host: actions, engines });
      },
      () => {
        if (active && attempt < CATALOG_RETRIES)
          retry = setTimeout(
            () => setAttempt((value) => value + 1),
            CATALOG_RETRY_MS * 2 ** attempt,
          );
      },
    );
    return () => {
      active = false;
      if (retry !== undefined) clearTimeout(retry);
    };
  }, [actions, needed, engines, attempt]);
  return { engines, mount };
}

export function useTurnTargetCatalog(
  actions: BridgeActions,
  current: TurnTarget | undefined,
  items: readonly SessionTranscriptItem[] | undefined,
  picker = false,
) {
  const needsEngines = useMemo(() => {
    const hasEngineModel = (target: TurnTarget) =>
      target.kind === 'engine' && target.model !== undefined;
    return (
      picker ||
      (current !== undefined && hasEngineModel(current)) ||
      items?.some(
        (item) =>
          item.kind === 'model-switch' && (hasEngineModel(item.from) || hasEngineModel(item.to)),
      ) === true
    );
  }, [current, items, picker]);
  const engine = useTurnTargetEngines<HTMLDivElement>(actions, needsEngines);
  const modelCatalog = useTurnTargetModels(
    actions,
    picker ||
      current?.kind === 'dsh' ||
      items?.some(
        (item) =>
          item.kind === 'model-switch' && (item.from.kind === 'dsh' || item.to.kind === 'dsh'),
      ) === true,
  );
  return {
    groups: modelCatalog.groups,
    catalog: {
      models: modelCatalog.models,
      engines: engine.engines,
    },
    mount: useCallback(
      (node: HTMLDivElement | null) => {
        modelCatalog.mount(node);
        engine.mount(node);
      },
      [modelCatalog.mount, engine.mount],
    ),
  };
}
