import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import { engineEffortName, isEngineId } from '@botharness/host-protocol/subscription-engine';
import { modelShortName } from '@botharness/host-client/shared/model-brand';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';

import type { SessionEngine, SessionModelRoute } from './bridge.js';
import { Tag } from './ds/tag.js';
import type { BotHarnessTranslate } from './locale.js';
import { ModelBrandIcon } from './model-brand.js';
import { SessionMetaChip } from './session-progress-view.js';

export function SessionTargetChip({
  target,
  engine,
  route,
  catalog,
  t,
}: {
  target?: TurnTarget | undefined;
  engine?: Omit<SessionEngine, 'state'> | undefined;
  route?: SessionModelRoute | undefined;
  catalog?: TurnTargetCatalog | undefined;
  t: BotHarnessTranslate;
}) {
  const selected: TurnTarget | undefined =
    target ??
    (engine !== undefined && isEngineId(engine.engine)
      ? { kind: 'engine', engine: engine.engine }
      : route === undefined
        ? undefined
        : { kind: 'dsh', provider: route.provider, model: route.model });
  if (selected?.model === undefined) return null;
  const label = turnTargetLabel(selected, catalog);
  const short =
    label.short === selected.model ? modelShortName(selected.model, label.brand) : label.short;
  const effortId = selected.kind === 'engine' ? selected.reasoningEffort : route?.reasoningEffort;
  const entry =
    selected.kind === 'dsh'
      ? catalog?.models?.find(
          (item) => item.provider === selected.provider && item.model === selected.model,
        )
      : undefined;
  const effort =
    effortId === undefined || effortId === ''
      ? undefined
      : engineEffortName(
          effortId,
          (level) => t(`engine.effort.${level}`),
          entry?.efforts?.find((item) => item.id === effortId)?.name,
        );
  const full = selected.kind === 'dsh' ? `${selected.provider}/${selected.model}` : short;
  return (
    <SessionMetaChip
      kind={label.external ? 'engine' : 'model'}
      icon={<ModelBrandIcon brand={label.brand} size={14} />}
      label={effort === undefined ? short : `${short} · ${effort}`}
      badge={
        <Tag tone="quiet">{t(label.external ? 'sessions.model.sub' : 'sessions.model.api')}</Tag>
      }
      title={effortId === undefined || effortId === '' ? full : `${full} · ${effortId}`}
    />
  );
}
