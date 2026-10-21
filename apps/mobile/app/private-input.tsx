import { useLocalSearchParams } from 'expo-router';
import { useHostSession } from '../src/host/host-session';
import { PrivateInputForm } from '../src/ui/private-input-form';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { Text } from '../src/ui/primitives/text';
import { t } from '../src/ui/strings';

export default function PrivateInputScreen() {
  const { client, saved, inbox } = useHostSession();
  const { hostId, channelId, messageId, botSlug } = useLocalSearchParams<{
    hostId: string;
    channelId: string;
    messageId: string;
    botSlug: string;
  }>();
  return (
    <SheetScreen>
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
