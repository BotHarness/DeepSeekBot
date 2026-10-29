import { useIsFocused } from 'expo-router';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Keyboard } from 'react-native';
import { ConversationScreen } from '../chat/conversation-screen';
import { EndSheet } from '../primitives/end-sheet';
import { ScrollChromeProvider } from './scroll-chrome';
import { conversationTarget } from './swipe-chat-target';
import type { ChatsSheetRequest } from './chats-sheet-root';
import type { RecentChat } from './recent-chats';
const Register = createContext<Dispatch<SetStateAction<ChatsSheetRequest | null>>>(() => {});
export function ChatsSheetRoot({ children }: { children: ReactNode }) {
  const [request, register] = useState<ChatsSheetRequest | null>(null);
  const routeFocused = useIsFocused();
  return (
    <Register.Provider value={register}>
      <ChatPanel request={request} covered={!routeFocused}>
        {children}
      </ChatPanel>
    </Register.Provider>
  );
}
function ChatPanel({
  request,
  children,
  covered,
}: {
  covered: boolean;
  request: ChatsSheetRequest | null;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState<RecentChat>();
  const chat = opened ?? request?.chat;
  const href = chat?.href;
  const target = conversationTarget(href);
  const open = opened !== undefined;
  const setOpen = useCallback((next: boolean) => setOpened(next ? chat : undefined), [chat]);
  const [nested, setNested] = useState(false);
  const close = useCallback(() => {
    Keyboard.dismiss();
    setOpened(undefined);
  }, []);
  const active = request?.active ?? false;
  return (
    <EndSheet
      fullWidth
      open={open && (active || covered)}
      active={active && !nested}
      enabled={Boolean(request?.enabled && target)}
      onOpenChange={setOpen}
      panel={
        target ? (
          <ScrollChromeProvider>
            <ConversationScreen
              key={href}
              expectedHostId={target.hostId}
              place={target.place}
              focus={undefined}
              presentation={{ active: active && open, onClose: close, onNestedChange: setNested }}
            />
          </ScrollChromeProvider>
        ) : null
      }
    >
      {children}
    </EndSheet>
  );
}
export function ChatsSheetRegistration({ chat, active, enabled }: ChatsSheetRequest) {
  const register = useContext(Register);
  const href = chat?.href,
    id = chat?.id,
    title = chat?.title;
  useLayoutEffect(() => {
    register({
      chat:
        href !== undefined && id !== undefined && title !== undefined
          ? { href, id, title }
          : undefined,
      active,
      enabled,
    });
    return () => register(null);
  }, [register, href, id, title, active, enabled]);
  return null;
}
