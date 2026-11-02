import type { BridgeMethods, BridgeResult } from '../bridge/methods.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_SHARE_DRAFT_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'share-draft-show',
    description:
      'Read the Share Draft the Human started for a Bot: each file with its status and privacy flags',
    write: false,
  },
  {
    command: 'share-draft-file',
    description: 'Read the text of one Share Draft file',
    write: false,
  },
  {
    command: 'share-draft-decide',
    description:
      'Keep, drop or rewrite one Share Draft file after the Human decided; never changes the Bot Memory',
    write: false,
  },
  {
    command: 'share-draft-finish',
    description:
      'Mark the Share Draft ready for the Human to upload once every file has a decision',
    write: false,
  },
];

export const SHARE_DRAFT_ERROR_CODES = [
  'share-draft-not-found',
  'share-draft-unreadable',
  'share-draft-pending',
  'share-draft-file-not-found',
  'share-draft-file-dropped',
  'not-a-text-file',
  'file-too-large',
  'nothing-to-upload',
] as const;

type ShareDraftBridge = Pick<
  BridgeMethods,
  'shareDraftGet' | 'shareDraftFile' | 'shareDraftDecide' | 'shareDraftFinish'
>;

function result<T>(value: BridgeResult<T>): T {
  if (value.ok) return value.value;
  const code = value.error.code;
  throw new TobError(
    (SHARE_DRAFT_ERROR_CODES as readonly string[]).includes(code)
      ? code
      : code === 'invalid-input'
        ? 'unknown-bot'
        : 'invalid-input',
  );
}

function draftView(draft: ReturnType<ShareDraftBridge['shareDraftGet']>) {
  const value = result(draft);
  return {
    slug: value.slug,
    state: value.state,
    summary: value.summary,
    files: value.files.map(({ path, kind, size, status, flags }) => ({
      path,
      kind,
      size,
      status,
      ...(flags.length === 0 ? {} : { flags }),
    })),
    ...(value.skipped.length === 0 ? {} : { skipped: value.skipped }),
  };
}

export function createTobShareDraftOperations(deps: {
  bridge: () => ShareDraftBridge;
}): PrepareTobOperation {
  return (command, args) => {
    const slug = args['slug'];
    const path = args['path'];
    switch (command) {
      case 'share-draft-show':
        return { run: () => draftView(deps.bridge().shareDraftGet({ slug })) };
      case 'share-draft-file':
        return { run: () => result(deps.bridge().shareDraftFile({ slug, path })) };
      case 'share-draft-decide':
        return {
          run: () =>
            draftView(
              deps.bridge().shareDraftDecide({
                slug,
                path,
                decision: args['decision'],
                ...(args['text'] === undefined ? {} : { text: args['text'] }),
              }),
            ),
        };
      case 'share-draft-finish':
        return { run: () => draftView(deps.bridge().shareDraftFinish({ slug })) };
      default:
        return undefined;
    }
  };
}
