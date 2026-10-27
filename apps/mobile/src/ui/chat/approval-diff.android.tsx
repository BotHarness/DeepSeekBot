import { useState } from 'react';
import { Column, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  clip,
  fillMaxWidth,
  padding,
  semantics,
  Shapes,
  testID,
} from '@expo/ui/jetpack-compose/modifiers';

import type { ApprovalFileChange } from '../../../../../packages/client/src/client/approval-diff';
import { materialType, useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { useStrings } from '../strings';
import { DIFF_LINES } from './approval-diff-limit';

export function FileDiff({ change }: { change: ApprovalFileChange }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const roles = useMaterialRoles();
  const [all, setAll] = useState(false);
  const shown = all ? change.lines : change.lines.slice(0, DIFF_LINES);
  const hidden = change.lines.length - shown.length;
  return (
    <Column verticalArrangement={{ spacedBy: space.x2 }} modifiers={[fillMaxWidth()]}>
      <Text color={roles.onSurfaceVariant} style={{ typography: materialType.meta }}>
        {`${change.path}  +${change.added} −${change.removed}`}
      </Text>
      <Column
        modifiers={[
          fillMaxWidth(),
          clip(Shapes.RoundedCorner(radius.md)),
          background(roles.surface),
          padding(space.x4, space.x3, space.x4, space.x3),
          semantics({ contentDescription: t.diffLabel(change.path) }),
          testID('approval-diff'),
        ]}
      >
        {shown.map((line, index) => (
          <Text
            key={index}
            {...(line.kind === 'add'
              ? { color: theme.color.success }
              : line.kind === 'remove'
                ? { color: theme.color.danger }
                : {})}
            style={{ typography: materialType.meta, fontFamily: 'monospace' }}
          >
            {`${line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '} ${line.text}`}
          </Text>
        ))}
      </Column>
      {hidden > 0 ? (
        <Button
          label={t.diffMore(hidden)}
          testID="approval-diff-more"
          variant="text"
          onPress={() => setAll(true)}
        />
      ) : null}
    </Column>
  );
}
