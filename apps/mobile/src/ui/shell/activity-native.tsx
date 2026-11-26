import type { HostClient } from '@botharness/host-client/client';
import {
  NATIVE_SESSION_ATTENTION_KIND,
  type HumanAttentionItem,
  type NativeSessionAttention,
} from '@botharness/host-protocol/wire';
import { SessionFolderAvatar } from '../../features/sessions/session-folder-avatar';
import type { useStrings } from '../strings';

type Strings = ReturnType<typeof useStrings>;

export function nativeSessionOf(item: HumanAttentionItem): NativeSessionAttention | undefined {
  return item.kind === NATIVE_SESSION_ATTENTION_KIND ? item.nativeSession : undefined;
}

export function nativeSessionName(native: NativeSessionAttention, t: Strings): string {
  return native.sessionTitle ?? t.hostSessions.untitled;
}

export function nativeSessionPreview(
  native: NativeSessionAttention,
  summary: string,
  t: Strings,
): string {
  const need = t.nativeSessionInput[native.input];
  return summary === '' ? need : `${need} · ${summary}`;
}

export function NativeSessionMark({
  native,
  client,
  size,
  corner,
}: {
  native: NativeSessionAttention;
  client?: HostClient | undefined;
  size: number;
  corner: number;
}) {
  return (
    <SessionFolderAvatar
      testID="activity-native-session-mark"
      folderName={native.folderName}
      look={native.folderLook}
      client={client}
      size={size}
      corner={corner}
    />
  );
}
