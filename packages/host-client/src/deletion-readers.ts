import type {
  WireAdministrativeBot,
  WireAdministrativeDeletion,
  WireAdministrativeDeletionPreview,
  WireBotDeletion,
  WireBotDeletionPreview,
} from '@botharness/host-protocol/wire';
import { readAdministrativeBot } from './bot-administration';
import {
  finiteNumber,
  HostAnswerInvalid,
  optional,
  record,
  strings,
  text,
  type HostCall,
} from './host-answer';

const phases: ReadonlySet<unknown> = new Set<WireBotDeletion['phase']>([
  'stopping',
  'cleanup',
  'complete',
  'incomplete',
]);
const memoryStates: ReadonlySet<unknown> = new Set<WireBotDeletion['memory']>([
  'retained',
  'pending',
  'erased',
]);
const dependencyKeys = ['sessions', 'workspaces', 'grants', 'identities', 'channels'];

function isDeletionMetadata(value: unknown): value is WireAdministrativeDeletion {
  const row = record(value);
  return (
    row !== undefined &&
    ['slug', 'displayName', 'acceptedAt'].every((key) => text(row[key])) &&
    typeof row['eraseMemory'] === 'boolean' &&
    phases.has(row['phase']) &&
    memoryStates.has(row['memory'])
  );
}

function isDeletion(value: unknown): value is WireBotDeletion {
  const row = record(value);
  return (
    row !== undefined &&
    isDeletionMetadata(value) &&
    text(row['memoryDir']) &&
    optional(row['failure'], text) &&
    optional(row['cleanupAccepted'], (accepted) => typeof accepted === 'boolean') &&
    optional(row['ownership'], (value) => {
      const ownership = record(value);
      const device = ownership?.['device'];
      const inode = ownership?.['inode'];
      return (
        text(ownership?.['path']) &&
        finiteNumber(device) &&
        Number.isInteger(device) &&
        device >= 0 &&
        finiteNumber(inode) &&
        Number.isInteger(inode) &&
        inode >= 0
      );
    })
  );
}

function isPreviewMetadata(
  value: unknown,
): value is Omit<WireAdministrativeDeletionPreview, 'deletion'> {
  const row = record(value);
  return (
    text(row?.['slug']) &&
    text(row['displayName']) &&
    text(row['token']) &&
    row['token'].length > 0 &&
    typeof row['eraseAvailable'] === 'boolean'
  );
}

function isPreview(value: unknown): value is WireBotDeletionPreview {
  const row = record(value);
  const dependencies = record(row?.['dependencies']);
  return (
    row !== undefined &&
    isPreviewMetadata(value) &&
    text(row['memoryDir']) &&
    optional(row['refusal'], text) &&
    dependencies !== undefined &&
    dependencyKeys.every((key) => strings(dependencies[key])) &&
    optional(row['deletion'], (deletion) => isDeletion(deletion) && deletion.slug === row['slug'])
  );
}

type MetadataReceipt = { metadataOnly: true; bot: WireAdministrativeBot };
type OwnPreview = { preview: WireBotDeletionPreview };
type AnyPreview = OwnPreview | (MetadataReceipt & { preview: WireAdministrativeDeletionPreview });
type OwnDeletion = { deletion: WireBotDeletion };
type AnyDeletion = OwnDeletion | (MetadataReceipt & { deletion: WireAdministrativeDeletion });

function administrativeDeletion(
  value: unknown,
  method: string,
  slug: string,
  eraseMemory?: boolean,
): WireAdministrativeDeletion {
  if (
    !isDeletionMetadata(value) ||
    value.slug !== slug ||
    (eraseMemory !== undefined && value.eraseMemory !== eraseMemory)
  )
    throw new HostAnswerInvalid(`${method} returned an invalid administrative deletion receipt.`);
  const { displayName, acceptedAt, eraseMemory: erase, phase, memory } = value;
  return { slug, displayName, acceptedAt, eraseMemory: erase, phase, memory };
}

function receiptMetadata(
  row: Record<string, unknown>,
  method: string,
  slug: string,
): MetadataReceipt {
  const bot = readAdministrativeBot(row['bot'], method);
  if (bot.slug !== slug)
    throw new HostAnswerInvalid(`${method} returned administrative metadata for another Bot.`);
  return { metadataOnly: true, bot };
}

export function previewBotDeletion(host: HostCall, slug: string): Promise<OwnPreview>;
export function previewBotDeletion(
  host: HostCall,
  slug: string,
  allowMetadata: true,
): Promise<AnyPreview>;
export async function previewBotDeletion(
  host: HostCall,
  slug: string,
  allowMetadata = false,
): Promise<AnyPreview> {
  const row = record(await host.call('deletionPreview', { slug }));
  const preview = row?.['preview'];
  if (
    allowMetadata &&
    row?.['metadataOnly'] === true &&
    isPreviewMetadata(preview) &&
    preview.slug === slug
  ) {
    const deletion = record(preview)?.['deletion'];
    const { displayName, token, eraseAvailable } = preview;
    return {
      ...receiptMetadata(row, 'deletionPreview', slug),
      preview: {
        slug,
        displayName,
        token,
        eraseAvailable,
        ...(deletion === undefined
          ? {}
          : {
              deletion: administrativeDeletion(deletion, 'deletionPreview', slug),
            }),
      },
    };
  }
  if (row?.['metadataOnly'] !== undefined || !isPreview(preview) || preview.slug !== slug)
    throw new HostAnswerInvalid('deletionPreview returned an invalid deletion scope.');
  return { preview };
}

function deletionReceipt(
  value: unknown,
  method: string,
  slug: string,
  allowMetadata: boolean,
  eraseMemory?: boolean,
): AnyDeletion {
  const row = record(value);
  const deletion = row?.['deletion'];
  if (allowMetadata && row?.['metadataOnly'] === true)
    return {
      ...receiptMetadata(row, method, slug),
      deletion: administrativeDeletion(deletion, method, slug, eraseMemory),
    };
  if (
    row?.['metadataOnly'] !== undefined ||
    !isDeletion(deletion) ||
    deletion.slug !== slug ||
    (eraseMemory !== undefined && deletion.eraseMemory !== eraseMemory)
  )
    throw new HostAnswerInvalid(`${method} returned an invalid deletion receipt.`);
  return { deletion };
}

interface Confirmation {
  slug: string;
  token: string;
  eraseMemory: boolean;
}

export function confirmBotDeletion(host: HostCall, args: Confirmation): Promise<OwnDeletion>;
export function confirmBotDeletion(
  host: HostCall,
  args: Confirmation,
  allowMetadata: true,
): Promise<AnyDeletion>;
export async function confirmBotDeletion(
  host: HostCall,
  args: Confirmation,
  allowMetadata = false,
): Promise<AnyDeletion> {
  return deletionReceipt(
    await host.call('deletionConfirm', { ...args }),
    'deletionConfirm',
    args.slug,
    allowMetadata,
    args.eraseMemory,
  );
}

export function retryBotDeletion(host: HostCall, slug: string): Promise<OwnDeletion>;
export function retryBotDeletion(
  host: HostCall,
  slug: string,
  allowMetadata: true,
): Promise<AnyDeletion>;
export async function retryBotDeletion(
  host: HostCall,
  slug: string,
  allowMetadata = false,
): Promise<AnyDeletion> {
  return deletionReceipt(
    await host.call('deletionRetry', { slug }),
    'deletionRetry',
    slug,
    allowMetadata,
  );
}
