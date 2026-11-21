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

export function useTurnTargetEngines<T extends Element>(actions: BridgeActions, needed: boolean) {
  const [catalog, setCatalog] = useState<{
    host: BridgeActions;
    engines: Awaited<ReturnType<BridgeActions['routingGroupEngines']>>;
  }>();
  const engines = catalog?.host === actions ? catalog.engines : undefined;
  const mount = useMountedResource<T>(() => {
    if (!needed || engines !== undefined || actions.routingGroupEngines === undefined) return;
    let active = true;
    void actions.routingGroupEngines().then(
      (engines) => {
        if (active) setCatalog({ host: actions, engines });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [actions, needed, engines]);
  return { engines, mount };
}

export function useTurnTargetCatalog(
  actions: BridgeActions,
  current: TurnTarget | undefined,
  items: readonly SessionTranscriptItem[] | undefined,
  picker = false,
) {
  const [catalog, setCatalog] = useState<{
    host: BridgeActions;
    models: ModelCatalogEntryView[];
    groups: ModelCatalogGroupView[];
  }>();
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
  const needsCatalog =
    catalog?.host !== actions &&
    (picker ||
      current?.kind === 'dsh' ||
      items?.some(
        (item) =>
          item.kind === 'model-switch' && (item.from.kind === 'dsh' || item.to.kind === 'dsh'),
      ));
  const catalogMount = useMountedResource<HTMLDivElement>(() => {
    if (!needsCatalog) return;
    let active = true;
    void actions.modelCatalog().then(
      ({ models, groups }) => {
        if (active) setCatalog({ host: actions, models, groups: groups ?? [] });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [actions, needsCatalog]);
  return {
    groups: catalog?.host === actions ? catalog.groups : undefined,
    catalog: {
      models: catalog?.host === actions ? catalog.models : undefined,
      engines: engine.engines,
    },
    mount: useCallback(
      (node: HTMLDivElement | null) => {
        catalogMount(node);
        engine.mount(node);
      },
      [catalogMount, engine.mount],
    ),
  };
}
