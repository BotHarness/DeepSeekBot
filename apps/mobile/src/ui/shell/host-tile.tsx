import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import { HOST_SYMBOLS, type HostIcon } from '../design/host-look';
import { radius } from '../design/tokens';
import { Text } from '../primitives/text';

export function hostInitial(hostName: string): string {
  return Array.from(hostName.trim())[0]?.toUpperCase() ?? '?';
}

export function HostGlyph({ icon, size, color }: { icon: HostIcon; size: number; color: string }) {
  if (icon.kind === 'symbol')
    return (
      <SymbolView
        name={HOST_SYMBOLS[icon.id]}
        size={size}
        tintColor={color}
        accessible={false}
        importantForAccessibility="no"
      />
    );
  return (
    <Text
      allowFontScaling={false}
      accessible={false}
      style={{ fontSize: size * 0.86, lineHeight: size, textAlign: 'center' }}
    >
      {icon.emoji}
    </Text>
  );
}

export function HostTile({
  hostName,
  icon,
  size,
  fill,
  ink,
}: {
  hostName: string;
  icon?: HostIcon;
  size: number;
  fill: string;
  ink: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: fill,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon === undefined ? (
        <Text allowFontScaling={false} variant="title" style={{ color: ink }}>
          {hostInitial(hostName)}
        </Text>
      ) : (
        <HostGlyph icon={icon} size={Math.round(size * 0.58)} color={ink} />
      )}
    </View>
  );
}
