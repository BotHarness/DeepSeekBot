import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { loadMemoryFile, loadMemoryFiles, memoryRouteParams } from '../../../src/host/bot-profile';
import { nativeMemoryPreview } from '../../../src/host/native-memory-preview';
import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { MemoryFolderView } from '../../../src/ui/chat/memory-browser';
import { saveMemoryFile } from '../../../src/host/memory-edit';
import { MemoryFileScreen } from '../../../src/ui/chat/memory-file-screen';
import { useStrings } from '../../../src/ui/strings';

export default function MemoryScreen() {
  const t = useStrings();
  const {
    slug,
    path = '',
    kind,
    role,
  } = useLocalSearchParams<{
    slug: string;
    path?: string;
    kind?: 'folder' | 'file';
    role?: string;
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
      {kind === 'file' ? null : <Stack.Screen options={{ title }} />}
      {kind === 'file' ? (
        loadFile === undefined ? null : (
          <MemoryFileScreen
            key={`${slug}:${path}`}
            title={title}
            load={loadFile}
            save={(body, expectedHead) =>
              saveMemoryFile(client!, bot!, { path, body, expectedHead })
            }
            preview={{ client: client!, io: nativeMemoryPreview, slug, path }}
            role={role === 'soul' || role === 'coreMemory' ? role : undefined}
          />
        )
      ) : loadFiles === undefined ? null : (
        <MemoryFolderView
          folder={path}
          load={loadFiles}
          onOpen={(entry) =>
            router.push({
              pathname: '/bot/[slug]/memory',
              params: memoryRouteParams(slug ?? '', entry),
            })
          }
        />
      )}
    </>
  );
}
