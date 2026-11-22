import type { EngineId } from './engine-choice.js';

export type SubChoice =
  | {
      kind: 'model';
      provider: string;
      model: string;
      allowedEfforts: string[];
      defaultEffort: string;
      note?: string;
    }
  | {
      kind: 'group';
      group: string;
      allowedEfforts?: string[];
      defaultEffort?: string;
      note?: string;
    }
  | {
      kind: 'engine';
      engine: EngineId;
      accountId?: string;
      model?: string;
      effort?: string;
      note?: string;
    };

export type SubSelection =
  | { kind: 'model'; provider: string; model: string }
  | { kind: 'group'; group: string }
  | { kind: 'engine'; engine: EngineId; accountId?: string; model?: string };

export interface SubChoices {
  choices: SubChoice[];
  default: SubSelection | null;
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

export function sameSubSelection(
  choice: SubChoice | SubSelection,
  selection: SubSelection,
): boolean {
  switch (selection.kind) {
    case 'model':
      return (
        choice.kind === 'model' &&
        choice.provider === selection.provider &&
        choice.model === selection.model
      );
    case 'group':
      return choice.kind === 'group' && choice.group === selection.group;
    case 'engine':
      return (
        choice.kind === 'engine' &&
        choice.engine === selection.engine &&
        choice.accountId === selection.accountId &&
        choice.model === selection.model
      );
  }
}
