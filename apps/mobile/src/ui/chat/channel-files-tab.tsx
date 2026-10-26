import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { HostClient } from '../../host/client';
import { useChannelFilesList } from './channel-files-screen';
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
  const list = useChannelFilesList(
    {
      client,
      hostId,
      channelId,
      ...(botSlug === undefined ? {} : { botSlug }),
    },
    active,
  );
  return children({
    rows: list.files.map((file) => ({
      key: file.key,
      render: () => list.renderFile(file),
    })),
    empty: (
      <View>
        {list.header}
        {list.empty}
      </View>
    ),
    footer: list.files.length === 0 ? undefined : list.footer,
    overlay: list.viewer,
  });
}
