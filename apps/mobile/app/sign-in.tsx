import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, View, type ViewInstance } from 'react-native';

import type { EmailCodeOutcome } from '../src/host/connect-account';
import { takeEmailCodeSignIn } from '../src/host/email-code-bridge';
import { EmailCodeSignIn } from '../src/ui/account/email-code-sign-in';
import { useMounted } from '../src/ui/mounted';
import { SheetHeader } from '../src/ui/primitives/sheet-header';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { useStrings } from '../src/ui/strings';

export default function SignInScreen() {
  const t = useStrings();
  const router = useRouter();
  const [request] = useState(takeEmailCodeSignIn);
  const done = useRef(false);
  const finish = (outcome: EmailCodeOutcome) => {
    if (done.current) return;
    done.current = true;
    request?.finish(outcome);
    if (router.canGoBack()) router.back();
  };
  const mount = useMounted<ViewInstance>(() => {
    if (request === undefined && router.canGoBack()) router.back();
    return () => {
      if (!done.current) request?.finish({ kind: 'cancelled' });
    };
  }, [request, router]);
  return (
    <SheetScreen onClose={() => finish({ kind: 'cancelled' })}>
      <SheetHeader
        title={t.emailSignIn.title}
        {...(Platform.OS === 'ios' ? { onClose: () => finish({ kind: 'cancelled' }) } : {})}
      />
      <View ref={mount} style={{ flex: 1 }}>
        {request === undefined ? null : <EmailCodeSignIn flow={request.flow} finish={finish} />}
      </View>
    </SheetScreen>
  );
}
