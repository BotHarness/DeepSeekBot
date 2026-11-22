import { answerRecord, finiteNumber, record, some, text, type HostCall } from './host-answer';

export interface ModelProviderView {
  id: string;
  name: string;
  keyLast4?: string;
  keyStored: boolean;
  modelCount: number;
  availability: 'available' | 'unavailable' | 'resting';
  restingUntil?: string;
  canRename: boolean;
  canReplaceKey: boolean;
  canRemove: boolean;
  revision: number;
}

export interface ModelProvidersView {
  revision?: number;
  providers: ModelProviderView[];
}

export interface ModelProviderSave {
  id: string;
  keyStored: boolean;
  modelCount: number;
  testReply: 'ok' | 'failed' | 'skipped';
  credentialCleanupPending?: boolean;
}

export interface ModelProviderRemoval {
  id: string;
  credentialCleanupPending?: boolean;
}

const AVAILABILITY: readonly ModelProviderView['availability'][] = [
  'available',
  'unavailable',
  'resting',
];

function parseProvider(value: unknown): ModelProviderView | undefined {
  const row = record(value);
  if (row === undefined || !text(row['id']) || !text(row['name'])) return undefined;
  const availability = row['availability'];
  return {
    id: row['id'],
    name: row['name'],
    ...(text(row['keyLast4']) ? { keyLast4: row['keyLast4'] } : {}),
    keyStored: row['keyStored'] === true,
    modelCount: finiteNumber(row['modelCount']) ? row['modelCount'] : 0,
    availability: AVAILABILITY.includes(availability as ModelProviderView['availability'])
      ? (availability as ModelProviderView['availability'])
      : 'unavailable',
    ...(text(row['restingUntil']) ? { restingUntil: row['restingUntil'] } : {}),
    canRename: row['canRename'] === true,
    canReplaceKey: row['canReplaceKey'] === true,
    canRemove: row['canRemove'] === true,
    revision: finiteNumber(row['revision']) ? row['revision'] : 0,
  };
}

export async function loadModelProviders(host: HostCall): Promise<ModelProvidersView> {
  const answer = answerRecord(await host.call('modelProviders', {}), 'modelProviders');
  return {
    ...(finiteNumber(answer['revision']) ? { revision: answer['revision'] } : {}),
    providers: some(answer['providers'], parseProvider),
  };
}
