import { useRouter } from 'expo-router';
import { Button } from '../primitives/creation-button';
import { useStrings } from '../strings';

export function ChannelFilesAction({
  hostId,
  channelId,
  botSlug,
}: {
  hostId: string;
  channelId: string;
  botSlug?: string;
}) {
  const router = useRouter();
  const t = useStrings();
  return (
    <Button
      label={t.channelFiles.title}
      testID="channel-files-open"
      variant="text"
      onPress={() =>
        router.push({
          pathname: '/channel-files',
          params: {
            hostId,
            channelId,
            ...(botSlug === undefined ? {} : { botSlug }),
          },
        })
      }
    />
  );
}
