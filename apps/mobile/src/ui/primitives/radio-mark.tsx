import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';

export function RadioMark({ selected }: { selected: boolean }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        width: theme.type.body.line,
        height: theme.type.body.line,
        borderRadius: radius.round,
        borderWidth: edge.focus,
        borderColor: selected ? theme.color.accent : theme.color.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected ? (
        <View
          style={{
            width: space.x3,
            height: space.x3,
            borderRadius: radius.round,
            backgroundColor: theme.color.accent,
          }}
        />
      ) : null}
    </View>
  );
}
