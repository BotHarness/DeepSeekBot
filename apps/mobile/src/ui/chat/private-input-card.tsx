import { useHostSession } from '../../host/host-session';
import { useRouter } from 'expo-router';
import { Button } from '../primitives/button';
import type { RequestRef } from '../../host/requests';
import { CardLine, CardNote, ActionCard } from './action-card';
import type { BubbleGroup } from './bubble-shape';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function PrivateInputCard({
  target,
  botName,
  purpose,
  resolved = false,
  focused = false,
  group,
  wide = false,
}: {
  target?: RequestRef;
  botName: string;
  purpose?: string | undefined;
  resolved?: boolean;
  focused?: boolean;
  group?: BubbleGroup;
  wide?: boolean;
}) {
  const router = useRouter();
  const { saved } = useHostSession();
  const category = t.kind['private-input']!;
  if (resolved)
    return (
      <CardLine
        text={t.cardLine(category, t.privateInputDone)}
        tone="success"
        focused={focused}
        {...(group === undefined ? {} : { group })}
      />
    );
  return (
    <ActionCard
      category={category}
      status={t.needsYou}
      title={t.privateInputTitle(botName)}
      focused={focused}
      wide={wide}
      {...(purpose === undefined
        ? {}
        : {
            preview: (
              <Text selectable variant="meta">
                {purpose}
              </Text>
            ),
          })}
    >
      <CardNote>{t.privateInputSecureNote}</CardNote>
      {target ? (
        <Button
          testID="private-input-open"
          label={t.privateInputOpen}
          tone="primary"
          onPress={() =>
            router.push({
              pathname: '/private-input',
              params: { ...target, hostId: saved?.hostId ?? '' },
            })
          }
        />
      ) : null}
    </ActionCard>
  );
}
