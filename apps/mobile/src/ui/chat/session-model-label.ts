import type {
  SessionModelChoice,
  SessionModelState,
} from '@botharness/host-protocol/session-model';
import { engineEffortName } from '@botharness/host-protocol/subscription-engine';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { engineCatalogModel, type ModelCatalogGroup } from '@botharness/host-client/model-catalog';
import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import type { en } from '../../features/sessions/strings';
import { sessionModelChip } from '../design/tokens';

export type SessionModelCatalog = TurnTargetCatalog & {
  groups?: readonly ModelCatalogGroup[] | undefined;
};

export function sessionModelKey(choice: SessionModelChoice | null) {
  if (choice === null) return 'default';
  if (choice.kind === 'group') return JSON.stringify(['group', choice.id]);
  if (choice.kind === 'model') return JSON.stringify(['model', choice.provider, choice.model]);
  return JSON.stringify(['engine', choice.engine, choice.accountId ?? '', choice.model]);
}

function choiceTarget(choice: SessionModelChoice | null): TurnTarget | undefined {
  if (choice === null || choice.kind === 'group') return undefined;
  if (choice.kind === 'model')
    return { kind: 'dsh', provider: choice.provider, model: choice.model };
  return {
    kind: 'engine',
    engine: choice.engine,
    model: choice.model,
    ...(choice.accountId === undefined ? {} : { account: choice.accountId }),
  };
}

export function sessionModelLabel({
  state,
  target,
  catalog,
  width,
  strings,
  noSession,
}: {
  state?: SessionModelState | undefined;
  target?: TurnTarget | undefined;
  catalog?: SessionModelCatalog | undefined;
  width: number;
  strings: typeof en.sessionModel;
  noSession?: boolean;
}): { brand: ModelBrand | undefined; name?: string; effort?: string; accessible: string } {
  const choice = state?.override ?? state?.default ?? null;
  const active = state?.active;
  const running = active !== undefined;
  const pending =
    running &&
    state !== undefined &&
    (sessionModelKey(state.override) !== sessionModelKey(active) ||
      state.override?.effort !== active?.effort);
  const preferred = choiceTarget(choice);
  const recorded = target?.model === undefined ? undefined : target;
  const visible = pending ? preferred : running ? (recorded ?? preferred) : preferred;
  const label = visible === undefined ? undefined : turnTargetLabel(visible, catalog);
  const model =
    visible?.kind === 'dsh'
      ? catalog?.models?.find(
          (row) => row.provider === visible.provider && row.model === visible.model,
        )
      : visible?.kind === 'engine' && visible.model !== undefined
        ? engineCatalogModel(catalog?.engines ?? [], { ...visible, model: visible.model })
        : undefined;
  const group =
    choice?.kind === 'group' ? catalog?.groups?.find((row) => row.id === choice.id) : undefined;
  const name =
    visible !== undefined
      ? model === undefined
        ? undefined
        : label?.short
      : (group?.name ??
        ((state !== undefined && choice === null) || noSession ? strings.defaultLabel : undefined));
  const effortId =
    (visible === recorded && recorded?.kind === 'engine' ? recorded.reasoningEffort : undefined) ??
    choice?.effort ??
    model?.defaultEffort;
  const effort =
    name === undefined || !effortId
      ? undefined
      : engineEffortName(
          effortId,
          strings.effort,
          model?.efforts?.find((item) => item.id === effortId)?.name,
        );
  const shown = name === undefined || !pending ? name : strings.next(name);
  return {
    brand: label?.brand,
    ...(shown !== undefined && width > sessionModelChip.hideNameAt ? { name: shown } : {}),
    ...(effort !== undefined && width > sessionModelChip.hideEffortAt ? { effort } : {}),
    accessible: strings.accessible(
      [strings.choice, shown, effort].filter((part) => part !== undefined),
    ),
  };
}
