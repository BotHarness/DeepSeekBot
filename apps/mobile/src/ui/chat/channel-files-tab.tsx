import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import type { HostClient } from '../../host/client';
import { space } from '../design/tokens';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Segmented } from '../primitives/segmented';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { useChannelFilesList } from './channel-files-screen';
import { isMedia, MediaRow, mediaRows, type ChannelFilesSegment } from './channel-media';
import type { ProfileTabBody } from './profile-shell';

export function ChannelFilesTab({
  client,
  hostId,
  channelId,
  botSlug,
  active,
  children,
}: {
  client: HostClient;
  hostId: string;
  channelId: string;
  botSlug?: string;
  active: boolean;
  children(body: ProfileTabBody): ReactNode;
}) {
  const t = useStrings();
  const [segment, setSegment] = useState<ChannelFilesSegment>('media');
  const list = useChannelFilesList(
    {
      client,
      hostId,
      channelId,
      ...(botSlug === undefined ? {} : { botSlug }),
    },
    { active, retain: true },
  );
  const media = segment === 'media';
  const shown = list.files.filter((file) => isMedia(file) === media);
  const empty =
    list.status === 'opening' && !list.loaded ? (
      <LoadingIndicator />
    ) : list.status === 'ready' || list.loaded ? (
      <Text testID={`channel-${segment}-empty`} tone="muted">
        {media
          ? list.hasOlder
            ? t.channelFiles.mediaNoRecent
            : t.channelFiles.mediaEmpty
          : list.hasOlder
            ? t.channelFiles.noRecent
            : t.channelFiles.empty}
      </Text>
    ) : null;
  return (
    <View ref={list.mount} style={{ flex: 1 }}>
      {children({
        rows: [
          {
            key: 'segments',
            render: () => (
              <View testID="channel-files-segments" style={{ paddingBottom: space.x5 }}>
                <Segmented<ChannelFilesSegment>
                  label={t.channelFiles.segments}
                  options={[
                    { value: 'media', label: t.channelFiles.media },
                    { value: 'files', label: t.channelFiles.files },
                  ]}
                  value={segment}
                  onChange={setSegment}
                />
              </View>
            ),
          },
          ...(list.header === undefined ? [] : [{ key: 'notice', render: () => list.header }]),
          ...(shown.length === 0
            ? empty === null
              ? []
              : [{ key: `${segment}:empty`, render: () => empty }]
            : media
              ? mediaRows(shown).map((row) => ({
                  key: `media:${row[0]?.key ?? ''}`,
                  render: () => (
                    <MediaRow
                      files={row}
                      available={list.available}
                      onOpen={list.openImage}
                      onActions={list.openActions}
                    />
                  ),
                }))
              : shown.map((file) => ({
                  key: `files:${file.key}`,
                  render: () => list.renderFile(file),
                }))),
        ],
        footer: list.footer,
        overlay: list.viewer,
      })}
    </View>
  );
}
