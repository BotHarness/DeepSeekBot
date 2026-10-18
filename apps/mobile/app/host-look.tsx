import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { useHostSession } from '../src/host/host-session';
import { forgetImage, hostLooks, pickLookImage, useHostLook } from '../src/host/native-host-look';
import { useDesignTheme } from '../src/ui/design/theme';
import { space } from '../src/ui/design/tokens';
import { Notice } from '../src/ui/request-parts';
import { HostLookEditor } from '../src/ui/shell/host-look-editor';
import { t } from '../src/ui/strings';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';

export default function HostLookScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hostId?: string }>();
  const theme = useDesignTheme();
  const { saved, hosts } = useHostSession();
  const host =
    params.hostId === undefined
      ? (saved ?? undefined)
      : hosts.find((entry) => entry.hostId === params.hostId);
  const hostId = host?.hostId ?? '';
  const look = useHostLook(hostId);
  if (host === undefined)
    return (
      <View style={{ flex: 1, padding: space.x5, backgroundColor: theme.color.base }}>
        <Notice tone="danger">{t.hostLookMissing}</Notice>
      </View>
    );
  return (
    <SheetScreen>
      <HostLookEditor
        hostName={host.hostName}
        look={look}
        actions={{
          onChange(next) {
            const before = hostLooks.look(hostId);
            hostLooks.set(hostId, next);
            if (before.avatar.kind === 'image' && before.avatar !== next.avatar)
              forgetImage(before.avatar.uri);
            if (before.banner.kind === 'image' && before.banner !== next.banner)
              forgetImage(before.banner.uri);
          },
          onPickImage: (slot) => pickLookImage(hostId, slot),
          onClose: () => router.back(),
        }}
      />
    </SheetScreen>
  );
}
