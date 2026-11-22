import type { SubscriptionModel } from '@botharness/host-client/model-plans';
import type { SubChoice, SubChoices, SubSelection } from '@botharness/host-client/preset-sub';
import {
  presetSubFromLegacy,
  presetSubWithEngine,
  type LegacySubSource,
} from '@botharness/host-protocol/preset-sub';

export type { SubChoice, SubChoices, SubSelection };

export function cleanSubChoices(sub: SubChoices): SubChoices {
  return {
    choices: sub.choices.map((choice) => {
      if (choice.note === undefined || choice.note.trim() !== '') return choice;
      const { note: _note, ...rest } = choice;
      return rest as SubChoice;
    }),
    default: sub.default,
  };
}

export function subSelectionOf(choice: SubChoice): SubSelection {
  switch (choice.kind) {
    case 'model':
      return { kind: 'model', provider: choice.provider, model: choice.model };
    case 'group':
      return { kind: 'group', group: choice.group };
    case 'engine':
      return {
        kind: 'engine',
        engine: choice.engine,
        ...(choice.accountId === undefined ? {} : { accountId: choice.accountId }),
        ...(choice.model === undefined ? {} : { model: choice.model }),
      };
  }
}

export function subOf(
  source: LegacySubSource | undefined,
  engine?: SubscriptionModel | null,
): SubChoices {
  if (source?.sub !== undefined) return source.sub;
  return presetSubWithEngine(presetSubFromLegacy(source ?? {}), engine ?? undefined);
}
