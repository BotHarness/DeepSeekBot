import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { loadMemoryFile, loadMemoryFiles } from '../../../src/host/bot-profile';
import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { MemoryFileView, MemoryFolderView } from '../../../src/ui/chat/memory-browser';
import { t } from '../../../src/ui/strings';

export default function MemoryScreen() {
  const {
    slug,
    path = '',
    kind,
  } = useLocalSearchParams<{
    slug: string;
    path?: string;
    kind?: 'folder' | 'file';
  }>();
  const router = useRouter();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  const loadFiles = useMemo(
    () =>
      client === undefined || bot === undefined ? undefined : () => loadMemoryFiles(client, bot),
    [client, bot?.slug, bot?.dmChannelId],
  );
  const loadFile = useMemo(
    () =>
      client === undefined || bot === undefined
        ? undefined
        : () => loadMemoryFile(client, bot, path),
    [client, bot?.slug, bot?.dmChannelId, path],
  );
  const title = path === '' ? t.profileSection.memory : (path.split('/').at(-1) ?? path);

  return (
    <>
      <Stack.Screen options={{ title }} />
      {kind === 'file' ? (
        loadFile === undefined ? null : (
          <MemoryFileView load={loadFile} />
        )
      ) : loadFiles === undefined ? null : (
        <MemoryFolderView
          folder={path}
          load={loadFiles}
          onOpen={(entry) =>
            router.push({
              pathname: '/bot/[slug]/memory',
              params: { slug: slug ?? '', path: entry.path, kind: entry.kind },
            })
          }
        />
      )}
    </>
  );
}
