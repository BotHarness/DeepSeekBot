import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import { isEngineId } from '@botharness/host-protocol/subscription-engine';
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
  return (
    <SessionMetaChip
      kind={label.external ? 'engine' : 'model'}
      icon={<ModelBrandIcon brand={label.brand} size={14} />}
      label={label.short}
      badge={
        <Tag tone="quiet">{t(label.external ? 'sessions.model.sub' : 'sessions.model.api')}</Tag>
      }
      title={label.short}
    />
  );
}
