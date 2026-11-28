import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { setWorkspaceLook } from '@botharness/host-client/host-sessions';
import { useHostSession } from '../src/host/host-session';
import { FolderLookEditor } from '../src/features/sessions/folder-look-editor';
import { useSessionFolderLook } from '../src/features/sessions/use-session-folder-look';
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
  const look = useSessionFolderLook(client, params.path);
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
