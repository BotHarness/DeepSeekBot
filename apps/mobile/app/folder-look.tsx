import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
  const params = useLocalSearchParams<{ hostId?: string; path?: string; folderName?: string }>();
  const { client } = useHostSession(params.hostId);
  const [look, setLook] = useState<WorkspaceLook | null | 'failed'>();
  useFocusEffect(
    useCallback(() => {
      if (client === undefined || params.path === undefined) return;
      let current = true;
      readWorkspaceLook(client, params.path).then(
        (stored) => current && setLook(stored),
        () => current && setLook('failed'),
      );
      return () => {
        current = false;
      };
    }, [client, params.path]),
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
        look={look ?? {}}
        onSave={async (next) => {
          await setWorkspaceLook(client, path, next);
        }}
        onClose={() => router.back()}
      />
    </SheetScreen>
  );
}
