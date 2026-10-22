import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { hostSession, useHostSession } from '../src/host/host-session';
import { ConversationSectionSheet } from '../src/ui/chat/conversation-section-sheet';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';

export default function ConversationSectionScreen() {
  const { hostId, channelId } = useLocalSearchParams<{ hostId: string; channelId: string }>();
  const session = useHostSession();
  const router = useRouter();
  const [owner] = useState(() => (session.saved?.hostId === hostId ? session.client : undefined));
  const isCurrent = () => {
    const current = hostSession.getState();
    return owner !== undefined && current.client === owner && current.saved?.hostId === hostId;
  };
  return (
    <SheetScreen>
      <ConversationSectionSheet
        key={`${hostId}:${channelId}`}
        client={owner}
        channelId={channelId}
        isCurrent={isCurrent}
        onClose={() => router.back()}
      />
    </SheetScreen>
  );
}
