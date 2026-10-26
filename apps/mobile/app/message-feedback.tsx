import { useState } from 'react';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useHostSession } from '../src/host/host-session';
import { MessageFeedbackForm } from '../src/ui/chat/message-feedback';
import { SheetPage } from '../src/ui/primitives/sheet-page';
import { Text } from '../src/ui/primitives/text';
import { useStrings } from '../src/ui/strings';
export default function MessageFeedbackScreen() {
  const { channelId, messageId, hostId, failureTurn } = useLocalSearchParams<{
    channelId: string;
    messageId: string;
    hostId: string;
    failureTurn?: string;
  }>();
  const { client, saved } = useHostSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  usePreventRemove(busy, () => {});
  const t = useStrings();
  return (
    <SheetPage title={t.feedback.title}>
      {client && saved?.hostId === hostId && channelId && messageId ? (
        <MessageFeedbackForm
          key={hostId + channelId + messageId}
          client={client}
          channelId={channelId}
          messageId={messageId}
          failureTurn={failureTurn === '1'}
          onBusyChange={setBusy}
          onClose={() => {
            if (!busy) router.back();
          }}
        />
      ) : (
        <Text>{t.feedback.unavailable}</Text>
      )}
    </SheetPage>
  );
}
