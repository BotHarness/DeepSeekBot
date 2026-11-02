import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { useHostSession } from '../src/host/host-session';
import { PrivateInputForm } from '../src/ui/private-input-form';
import { SheetHeader } from '../src/ui/primitives/sheet-header';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { Text } from '../src/ui/primitives/text';
import { useStrings } from '../src/ui/strings';

export default function PrivateInputScreen() {
  const t = useStrings();
  const router = useRouter();
  const { client, saved, inbox } = useHostSession();
  const { hostId, channelId, messageId, botSlug } = useLocalSearchParams<{
    hostId: string;
    channelId: string;
    messageId: string;
    botSlug: string;
  }>();
  return (
    <SheetScreen>
      <SheetHeader
        title={t.privateInputOpen}
        {...(Platform.OS === 'ios' ? { onClose: () => router.back() } : {})}
      />
      {client && saved && hostId === saved.hostId && channelId && messageId && botSlug ? (
        <PrivateInputForm
          key={`${saved.hostId}:${messageId}`}
          client={client}
          target={{ channelId, messageId, botSlug }}
          after={() => void inbox?.refresh()}
        />
      ) : (
        <Text>{t.privateInputEmpty}</Text>
      )}
    </SheetScreen>
  );
}
