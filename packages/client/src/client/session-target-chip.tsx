import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import { engineEffortName, isEngineId } from '@botharness/host-protocol/subscription-engine';
import { modelShortName } from '@botharness/host-client/shared/model-brand';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';

import type { SessionEngine, SessionModelRoute } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { TargetBrandIcon } from './model-brand.js';
import { engineAccountTitle } from './session-engine.js';
import { SessionMetaChip } from './session-progress-view.js';

interface SessionTargetChipProps {
  target?: TurnTarget | undefined;
  engine?: Omit<SessionEngine, 'state'> | undefined;
  route?: SessionModelRoute | undefined;
  catalog?: TurnTargetCatalog | undefined;
  t: BotHarnessTranslate;
}

export function sessionTargetChipData({
  target,
  engine,
  route,
  catalog,
  t,
}: SessionTargetChipProps) {
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
  const accountTitle =
    selected?.kind === 'engine' ? engineAccountTitle(selected.engine, selected.account) : undefined;
  if (selected?.model === undefined) return { accountTitle, model: undefined };
  const label = turnTargetLabel(selected, catalog);
  const short =
    label.short === selected.model ? modelShortName(selected.model, label.brand) : label.short;
  const effortId =
    selected.kind === 'engine'
      ? selected.reasoningEffort
      : route?.provider === selected.provider && route.model === selected.model
        ? route.reasoningEffort
        : undefined;
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
  return {
    accountTitle,
    model: {
      brand: label.brand,
      external: label.external,
      label: effort === undefined ? short : `${short} · ${effort}`,
      title: effortId === undefined || effortId === '' ? full : `${full} · ${effortId}`,
    },
  };
}

export function SessionTargetChip(props: SessionTargetChipProps) {
  const { model } = sessionTargetChipData(props);
  if (model === undefined) return null;
  return (
    <SessionMetaChip
      kind={model.external ? 'engine' : 'model'}
      icon={
        <TargetBrandIcon
          brand={model.brand}
          external={model.external}
          size={14}
          externalLabel={props.t('engine.externalLabel')}
        />
      }
      label={model.label}
      title={model.title}
    />
  );
}
