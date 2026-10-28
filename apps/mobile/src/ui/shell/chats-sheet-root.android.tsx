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
const Register = createContext<Dispatch<SetStateAction<ChatsSheetRequest | null>>>(() => {});
export function ChatsSheetRoot({ children }: { children: ReactNode }) {
  const [request, register] = useState<ChatsSheetRequest | null>(null);
  const routeFocused = useIsFocused();
  const target = conversationTarget(request?.chat?.href);
  return (
    <Register.Provider value={register}>
      <ChatPanel request={request} target={target} covered={!routeFocused}>
        {children}
      </ChatPanel>
    </Register.Provider>
  );
}
function ChatPanel({
  request,
  target,
  children,
  covered,
}: {
  covered: boolean;
  request: ChatsSheetRequest | null;
  target: ReturnType<typeof conversationTarget>;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState<string>();
  const href = request?.chat?.href;
  const open = href !== undefined && opened === href;
  const setOpen = useCallback((next: boolean) => setOpened(next ? href : undefined), [href]);
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
