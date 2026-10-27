import type { BotCreationDraft, BotCreationOperation } from './bot-creation';
import type { HostStatus } from './host-glance';

export type CreationFlow = 'blank' | 'git' | 'zip' | 'marketplace';
export type CreationStep = 'environment' | 'git' | 'zip' | 'identity' | 'persona' | 'confirm';

const orders: Record<CreationFlow, readonly CreationStep[]> = {
  blank: ['environment', 'identity', 'persona'],
  git: ['environment', 'git', 'identity', 'persona'],
  zip: ['environment', 'zip', 'identity', 'persona'],
  marketplace: ['environment', 'identity', 'confirm'],
};

export function creationSteps(flow: CreationFlow): readonly CreationStep[] {
  return orders[flow];
}

export function isCreationFlow(value: unknown): value is CreationFlow {
  return typeof value === 'string' && Object.hasOwn(orders, value);
}

export function sourceFlow(
  source: BotCreationDraft['source'] | BotCreationOperation['source'],
): CreationFlow | undefined {
  if (source?.kind === 'zip') return 'zip';
  if (source?.kind === 'git') return source.origin === 'marketplace' ? 'marketplace' : 'git';
  return undefined;
}

export interface EnvironmentChoice {
  hostId: string;
  status: HostStatus;
}

export function defaultEnvironment(choices: readonly EnvironmentChoice[], last: string): string {
  const usable = choices.filter((choice) => choice.status !== 'offline');
  if (choices.length === 1) return usable[0]?.hostId ?? '';
  return usable.some((choice) => choice.hostId === last) ? last : '';
}

export function creationStepReady(
  step: CreationStep,
  draft: BotCreationDraft,
  choices: readonly EnvironmentChoice[],
): boolean {
  switch (step) {
    case 'environment':
      return choices.some(
        (choice) => choice.hostId === draft.hostId && choice.status !== 'offline',
      );
    case 'git':
      return draft.source?.kind === 'git' && draft.source.gitUrl.trim() !== '';
    case 'zip':
      return draft.source?.kind === 'zip';
    case 'identity':
      return draft.displayName.trim() !== '';
    default:
      return true;
  }
}
