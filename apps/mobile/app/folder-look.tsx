import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { readWorkspaceLook, setWorkspaceLook } from '@botharness/host-client/host-sessions';
import type { WorkspaceLook } from '@botharness/host-protocol/host-sessions';
import { useHostSession } from '../src/host/host-session';
import { FolderLookEditor } from '../src/features/sessions/folder-look-editor';
import { space } from '../src/ui/design/tokens';
import { LoadingIndicator } from '../src/ui/primitives/loading-indicator';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { Notice } from '../src/ui/request-parts';
import { useStrings } from '../src/ui/strings';

export default function FolderLookScreen() {
  const t = useStrings().hostSessions;
  const router = useRouter();
  const params = useLocalSearchParams<{
    hostId?: string;
    path?: string;
    folderName?: string;
    autoColor?: string;
  }>();
  const { client } = useHostSession(params.hostId);
  const target = useMemo(() => ({ client, path: params.path }), [client, params.path]);
  const [loaded, setLoaded] = useState<{
    target: typeof target;
    look: WorkspaceLook | null | 'failed';
  }>();
  const look = loaded?.target === target ? loaded.look : undefined;
  useFocusEffect(
    useCallback(() => {
      if (target.client === undefined || target.path === undefined) return;
      let current = true;
      readWorkspaceLook(target.client, target.path).then(
        (stored) => current && setLoaded({ target, look: stored }),
        () => current && setLoaded({ target, look: 'failed' }),
      );
      return () => {
        current = false;
      };
    }, [target]),
  );
  if (client === undefined || params.path === undefined || look === 'failed')
    return (
      <SheetScreen>
        <View style={{ flex: 1, padding: space.x5 }}>
          <Notice tone="danger">{t.folderLookMissing}</Notice>
        </View>
      </SheetScreen>
    );
  if (look === undefined)
    return (
      <SheetScreen>
        <LoadingIndicator />
      </SheetScreen>
    );
  const path = params.path;
  return (
    <SheetScreen>
      <FolderLookEditor
        folderName={params.folderName}
        autoColor={params.autoColor}
        look={look ?? {}}
        onSave={async (next) => {
          await setWorkspaceLook(client, path, next);
        }}
        onClose={() => router.back()}
      />
    </SheetScreen>
  );
}
