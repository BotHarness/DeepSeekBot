import type { Context } from '@deepseek-ai/cordis';
import {
  createAttachmentHttp,
  CHANNEL_ATTACHMENT_PATH,
  CHANNEL_ATTACHMENT_UPLOAD_PATH,
} from '../../attachments/http.js';
import type { HostFetchConnection } from '../../plugin-types.js';
import type { BotHarnessCore } from '../../plugin-types.js';

export function mountAttachmentRoutes(
  connectionCtx: Context,
  connection: HostFetchConnection,
  core: Pick<BotHarnessCore, 'attachments' | 'channels' | 'externalMessaging' | 'mediaVersions'>,
) {
  const attachmentHttp = createAttachmentHttp(
    core.attachments,
    core.channels,
    async (input) => {
      const ref = await (
        input.representation === 'playback'
          ? core.externalMessaging.prepareAudio
          : core.externalMessaging.acquireFile
      )(input.slug, input.sourceEventId, input.attachmentId, input.signal);
      const signal = AbortSignal.any([
        input.signal,
        core.externalMessaging.inbound.sourceSignal(input.slug, input.sourceEventId),
      ]);
      const downloaded = await core.attachments.download(ref.fileId!, ref.name, signal);
      return downloaded;
    },
    (input) => core.externalMessaging.readChannelMedia(input),
    core.mediaVersions,
  );
  connectionCtx.effect(
    () =>
      connection.fetch.register({
        path: CHANNEL_ATTACHMENT_UPLOAD_PATH,
        methods: ['POST'],
        requestBody: 'streaming',
        fetch: attachmentHttp,
      }),
    'botharness: Channel attachment upload',
  );
  connectionCtx.effect(
    () =>
      connection.fetch.register({
        path: CHANNEL_ATTACHMENT_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: attachmentHttp,
      }),
    'botharness: Channel attachment download',
  );
}
