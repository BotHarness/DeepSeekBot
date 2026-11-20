import * as stylex from '@stylexjs/stylex';
import { useCallback, useState } from 'react';

import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import type { ModelCatalogEntry } from '@botharness/host-client/model-catalog';
import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import { ink, space, type } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BridgeActions } from './actions.js';
import type { SessionTranscriptItem } from './bridge.js';
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
) {
  const [catalog, setCatalog] = useState<{ host: BridgeActions; models: ModelCatalogEntry[] }>();
  const hasTarget = (matches: (target: TurnTarget) => boolean) =>
    (current !== undefined && matches(current)) ||
    items?.some(
      (item) =>
        (item.kind === 'reply' || item.kind === 'turn-end') && item.turnTargets?.some(matches),
    ) === true;
  const engine = useTurnTargetEngines<HTMLDivElement>(
    actions,
    hasTarget((target) => target.kind === 'engine' && target.model !== undefined),
  );
  const needsCatalog = catalog?.host !== actions && hasTarget((target) => target.kind === 'dsh');
  const catalogMount = useMountedResource<HTMLDivElement>(() => {
    if (!needsCatalog) return;
    let active = true;
    void actions.modelCatalog().then(
      ({ models }) => {
        if (active) setCatalog({ host: actions, models });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [actions, needsCatalog]);
  return {
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
