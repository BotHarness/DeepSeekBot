import { useState } from 'react';
import { View } from 'react-native';

import type { ApprovalFileChange } from '../../../../../packages/client/src/client/approval-diff';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { t } from '../strings';

export const DIFF_LINES = 40;

export function FileDiff({ change }: { change: ApprovalFileChange }) {
  const theme = useDesignTheme();
  const [all, setAll] = useState(false);
  const shown = all ? change.lines : change.lines.slice(0, DIFF_LINES);
  const hidden = change.lines.length - shown.length;
  return (
    <View style={{ gap: space.x2 }}>
      <Text variant="meta" tone="muted">
        {`${change.path}  +${change.added} −${change.removed}`}
      </Text>
      <View
        accessibilityLabel={t.diffLabel(change.path)}
        testID="approval-diff"
        style={{
          backgroundColor: theme.layer.well.fill,
          borderRadius: radius.md,
          paddingHorizontal: space.x4,
          paddingVertical: space.x3,
        }}
      >
        {shown.map((line, index) => (
          <Text
            key={index}
            selectable
            variant="meta"
            tone={line.kind === 'add' ? 'success' : line.kind === 'remove' ? 'danger' : 'fg'}
            style={{ fontFamily: theme.mono }}
          >
            {`${line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '} ${line.text}`}
          </Text>
        ))}
      </View>
      {hidden > 0 ? (
        <Button
          label={t.diffMore(hidden)}
          testID="approval-diff-more"
          variant="text"
          onPress={() => setAll(true)}
        />
      ) : null}
    </View>
  );
}
