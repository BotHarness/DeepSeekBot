import { sessionHeaderTargetLabel, turnTargetLabel } from '@botharness/host-client/turn-target';
import type { ModelCatalogEntry } from '@botharness/host-client/model-catalog';
import { isEngineId } from '@botharness/host-protocol/subscription-engine';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';

import type { SessionEngine, SessionModelRoute } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { TargetBrandIcon } from './model-brand.js';
import { routingGroupEngineCopy } from './model-menu.js';
import { engineChipLabel, engineQuotaText } from './session-engine.js';
import { SessionMetaChip } from './session-progress-view.js';

export function SessionTargetChip({
  target,
  engine,
  route,
  models,
  header,
  t,
}: {
  target?: TurnTarget | undefined;
  engine?: Omit<SessionEngine, 'state'> | undefined;
  route?: SessionModelRoute | undefined;
  models?: readonly ModelCatalogEntry[] | undefined;
  header?: boolean;
  t: BotHarnessTranslate;
}) {
  const selected: TurnTarget | undefined =
    target ??
    (engine !== undefined && isEngineId(engine.engine)
      ? {
          kind: 'engine',
          engine: engine.engine,
          ...(engine.account === undefined ? {} : { account: engine.account }),
        }
      : route === undefined
        ? undefined
        : { kind: 'dsh', provider: route.provider, model: route.model });
  if (selected === undefined) return null;
  const label = header
    ? sessionHeaderTargetLabel(selected, models)
    : turnTargetLabel(selected, models, routingGroupEngineCopy(t));
  const nativeEffort =
    selected.kind === 'dsh' &&
    route?.provider === selected.provider &&
    route.model === selected.model
      ? (models
          ?.find((item) => item.provider === selected.provider && item.model === selected.model)
          ?.efforts?.find((item) => item.id === route.reasoningEffort)?.name ??
        route.reasoningEffort)
      : undefined;
  const text = [label.short, header ? undefined : (label.effort ?? nativeEffort)]
    .filter(Boolean)
    .join(' · ');
  const title = [sessionHeaderTargetLabel(selected, models).name, engineQuotaText(engine?.quota, t)]
    .filter(Boolean)
    .join(' · ');
  return (
    <SessionMetaChip
      kind={label.external ? 'engine' : 'model'}
      icon={<TargetBrandIcon {...label} size={14} externalLabel={t('engine.externalLabel')} />}
      label={header || !label.external ? text : engineChipLabel(text, engine?.quota, t)}
      title={title}
    />
  );
}
