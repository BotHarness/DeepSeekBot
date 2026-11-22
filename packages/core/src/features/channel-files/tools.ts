import type { Context } from '@deepseek-ai/cordis';
import { AttachmentId, type ImageMediaType } from '@deepseek-ai/dsh-attachment';
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { OrchestratorAgentRun } from '../../runtime/bot-runtime.js';

const CHANNEL_IMAGE_MEDIA_TYPES: readonly ImageMediaType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

type ChannelFileToolRun = Pick<OrchestratorAgentRun, 'inboundChannelId'> & {
  channels: Pick<
    OrchestratorAgentRun['channels'],
    'openAttachment' | 'saveAttachment' | 'importAttachment' | 'readAttachment'
  >;
};

export function registerChannelFileTools(
  currentRun: () => ChannelFileToolRun | undefined,
  agentCtx: Pick<Context, 'get'>,
  registerTool: (tool: ToolDefinition) => unknown,
): void {
  registerTool(
    defineTool({
      name: 'channel_attachment_open',
      description:
        'Access one current original attached to an accessible Channel message using native file tools. Read is the default intent; choose edit-original only on an explicit Human request and approval. Returns the exact path for this turn; no copy, send or automatic file-change notification.',
      parameters: {
        message_id: {
          type: 'string',
          required: true,
          description: 'Exact source message id from channel_read.',
        },
        file_id: {
          type: 'string',
          required: true,
          description: 'Exact fileId (or legacy hash) attached to that message.',
        },
        channel_id: {
          type: 'string',
          description: 'Source Channel id; defaults to the inbound Channel.',
        },
        access: {
          type: 'string',
          enum: ['read', 'edit-original'],
          required: true,
          description:
            'read for inspection; edit-original only when Human explicitly requests changing this original.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args, execution) => {
        const active = currentRun();
        if (active === undefined || active.channels.openAttachment === undefined)
          throw new Error('Original attachment access is unavailable');
        return JSON.stringify(
          active.channels.openAttachment({
            messageId: args.message_id,
            fileId: args.file_id,
            access: args.access,
            signal: execution.signal,
            ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
          }),
        );
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'channel_attachment_save',
      description:
        'Save the current exact attachment from an accessible Channel message as a separate ordinary file in a Human-authorized writable Grant. Supports any format, including ZIP. No overwrite; parent folder must exist.',
      parameters: {
        message_id: {
          type: 'string',
          required: true,
          description: 'Source message id from channel_read.',
        },
        file_id: {
          type: 'string',
          required: true,
          description: 'Exact opaque fileId (or legacy hash) on that message.',
        },
        channel_id: {
          type: 'string',
          description: 'Source Channel id; defaults to the inbound Channel.',
        },
        grant_id: {
          type: 'string',
          required: true,
          description: 'Active Grant id with orchestratorWrite true from list_workspace_grants.',
        },
        destination_path: {
          type: 'string',
          required: true,
          description: 'Relative file path inside the selected Grant; parent directory must exist.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args, execution) => {
        const active = currentRun();
        if (active === undefined || active.channels.saveAttachment === undefined)
          throw new Error('Attachment save is unavailable');
        const saved = await active.channels.saveAttachment({
          messageId: args.message_id,
          fileId: args.file_id,
          grantId: args.grant_id,
          destinationPath: args.destination_path,
          signal: execution.signal,
          ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
        });
        return `Saved independent working file: ${saved.path}\nBytes: ${saved.size}\nOriginal reference: ${JSON.stringify(saved.source)}`;
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'channel_attachment_import',
      description:
        'Import one selected generated file from Memory or a currently authorized Grant as a new independent Attachment. Returns a trusted reference to pass unchanged to bot_send_message attachments; this does not send a message.',
      parameters: {
        file_path: {
          type: 'string',
          required: true,
          description: 'Absolute canonical path of the selected regular output file.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args, execution) => {
        const active = currentRun();
        if (active === undefined || active.channels.importAttachment === undefined)
          throw new Error('Attachment import is unavailable');
        return JSON.stringify(
          await active.channels.importAttachment({
            filePath: args.file_path,
            signal: execution.signal,
          }),
        );
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'channel_read_image',
      description:
        'Inspect one image attached to a Channel message this PersonaBot has joined. Pass channel_id, message_id, and attachment_id using the opaque fileId returned by channel_read, or hash for a legacy attachment. This returns the image itself without exposing a Host filesystem path.',
      parameters: {
        channel_id: {
          type: 'string',
          description: 'Channel id; defaults to the inbound Channel.',
        },
        message_id: {
          type: 'string',
          required: true,
          description: 'Owning Channel message id returned by channel_read.',
        },
        attachment_id: {
          type: 'string',
          description:
            'Opaque fileId returned by channel_read; use exactly one of attachment_id or legacy hash.',
        },
        hash: {
          type: 'string',
          description: 'Legacy sha256 attachment hash returned by channel_read.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            channelId: { type: 'string', required: true },
            messageId: { type: 'string', required: true },
            hash: { type: 'string' },
            fileId: { type: 'string' },
            image: {
              type: 'object',
              additionalProperties: false,
              required: true,
              properties: {
                attachmentId: { type: 'string', required: true },
                mediaType: {
                  type: 'string',
                  enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
                  required: true,
                },
                bytes: { type: 'integer', required: true },
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
                name: { type: 'string' },
                originalDimensions: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    width: { type: 'integer', required: true },
                    height: { type: 'integer', required: true },
                  },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const image = value.image;
          return [
            {
              type: 'text',
              text: `Channel image ${value.fileId ?? value.hash} from message ${value.messageId}`,
            },
            {
              type: 'image',
              attachment: {
                attachmentId: AttachmentId(image.attachmentId),
                mediaType: image.mediaType,
                bytes: image.bytes,
                width: image.width,
                height: image.height,
                ...(image.name === undefined ? {} : { name: image.name }),
                ...(image.originalDimensions === undefined
                  ? {}
                  : { originalDimensions: { ...image.originalDimensions } }),
              },
            },
          ];
        },
      },
      execute: async (args, exec) => {
        const active = currentRun();
        if (active === undefined) {
          throw new Error('channel_read_image: Orchestrator run is unavailable');
        }
        const access = active.channels.readAttachment;
        if (access === undefined) {
          throw new Error('channel_read_image: Channel attachment access is unavailable');
        }
        const hostAttachments = agentCtx.get('attachments');
        if (hostAttachments === undefined) {
          throw new Error('channel_read_image: DSH attachment service is unavailable');
        }
        const maxBytes = Math.min(
          hostAttachments.imageLimits.maxImageBytes,
          hostAttachments.imageLimits.maxMessageImageBytes,
        );
        const imageChannelId = args.channel_id ?? active.inboundChannelId;
        if (imageChannelId === undefined)
          throw new Error('channel_read_image: explicit Channel required');
        const result = await access({
          ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
          messageId: args.message_id,
          ...(args.hash === undefined ? {} : { hash: args.hash }),
          ...(args.attachment_id === undefined ? {} : { attachmentId: args.attachment_id }),
          maxBytes,
          signal: exec.signal,
        });
        if (!CHANNEL_IMAGE_MEDIA_TYPES.includes(result.ref.mime as ImageMediaType)) {
          throw new Error(
            `channel_read_image: ${result.ref.mime} is not a supported model image type`,
          );
        }
        const image = await hostAttachments.saveImage({
          data: result.data,
          mediaType: result.ref.mime as ImageMediaType,
          name: result.ref.name,
        });
        return {
          channelId: imageChannelId,
          messageId: args.message_id,
          ...(result.ref.fileId === undefined
            ? { hash: result.ref.hash }
            : { fileId: result.ref.fileId }),
          image,
        };
      },
    }),
  );
}

export function createBridgeAttachmentSaveTool(
  currentRun: () => Pick<OrchestratorAgentRun, 'externalMessaging'> | undefined,
) {
  return defineTool({
    name: 'bridge_attachment_save',
    description:
      'Save a trusted external Inbox attachment as an independent working copy in an explicitly writable Workspace Grant. Downloads bounded bytes only on first access. Optional representation=playback produces a bounded WAV from supported WeChat SILK without speech recognition. Use the returned path with native file tools and Shell; preserves the received original.',
    parameters: {
      source_event_id: {
        type: 'string',
        required: true,
        description: 'Canonical source_event_id from your Bot Inbox.',
      },
      attachment_id: {
        type: 'string',
        required: true,
        description: 'Attachment id returned by bridge_read; never a URL or provider resource key.',
      },
      representation: {
        type: 'string',
        enum: ['playback'],
        description:
          'Optional: prepare supported WeChat voice as WAV. Omit to save the unchanged original. This does not transcribe or understand speech.',
      },
      grant_id: {
        type: 'string',
        required: true,
        description: 'Current Workspace Grant with Orchestrator write authorization.',
      },
      destination_path: {
        type: 'string',
        required: true,
        description: 'New relative file path in that Grant; parent directory must already exist.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      const active = currentRun();
      if (active === undefined || !active.externalMessaging)
        throw new Error('bridge_attachment_save: unavailable');
      return JSON.stringify(
        await active.externalMessaging.saveFile({
          sourceEventId: args.source_event_id,
          attachmentId: args.attachment_id,
          ...(args.representation === 'playback' ? { representation: 'playback' } : {}),
          grantId: args.grant_id,
          destinationPath: args.destination_path,
        }),
      );
    },
  });
}
