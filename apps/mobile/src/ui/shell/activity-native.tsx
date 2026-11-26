import type { HostColorId } from '@botharness/host-client/ui/design/host-look';
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
  size,
  corner,
  hostColor,
}: {
  native: NativeSessionAttention;
  size: number;
  corner: number;
  hostColor: HostColorId;
}) {
  return (
    <SessionFolderAvatar
      testID="activity-native-session-mark"
      folderName={native.folderName}
      colorId={hostColor}
      size={size}
      corner={corner}
    />
  );
}
