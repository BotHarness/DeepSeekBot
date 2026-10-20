import { CardButtons, CardLine, CardNote, ActionCard } from './action-card';
import type { BubbleGroup } from './bubble-shape';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function PrivateInputCard({
  botName,
  purpose,
  resolved = false,
  focused = false,
  group,
  wide = false,
  onFill,
}: {
  botName: string;
  purpose?: string | undefined;
  resolved?: boolean;
  focused?: boolean;
  group?: BubbleGroup;
  wide?: boolean;
  onFill(): void;
}) {
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
      <CardNote>{t.privateInputNote}</CardNote>
      <CardButtons stack>
        <Button
          label={t.privateInputFill}
          testID="private-input-fill"
          tone="primary"
          onPress={onFill}
        />
      </CardButtons>
    </ActionCard>
  );
}
