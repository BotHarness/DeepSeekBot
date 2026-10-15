import { Image, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import {
  avatarSvg,
  seededAvatarFor,
} from '../../../../../packages/core/src/bots/avatar-appearance';
import type { HostAvatar } from '../design/host-look';
import { radius } from '../design/tokens';
import { Text } from '../primitives/text';

const presets = new Map<string, string>();

export function presetAvatarSvg(id: string): string {
  let svg = presets.get(id);
  if (svg === undefined) {
    const seed = id.endsWith('2') ? 2 : undefined;
    svg = avatarSvg(seededAvatarFor(seed === 2 ? id.slice(0, -1) : id, seed));
    presets.set(id, svg);
  }
  return svg;
}

export function hostInitial(hostName: string): string {
  return Array.from(hostName.trim())[0]?.toUpperCase() ?? '?';
}

/**
 * The Host's tile: its initial on the band's ink by default, or a preset pixel portrait or a
 * picture the Human chose.
 */
export function HostTile({
  hostName,
  avatar,
  size,
  fill,
  letter,
}: {
  hostName: string;
  avatar: HostAvatar;
  size: number;
  /** Tile fill behind the initial. */
  fill: string;
  /** The initial's colour. */
  letter: string;
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
      {avatar.kind === 'preset' ? (
        <SvgXml xml={presetAvatarSvg(avatar.id)} width={size} height={size} />
      ) : avatar.kind === 'image' ? (
        <Image source={{ uri: avatar.uri }} style={{ width: size, height: size }} />
      ) : (
        <Text variant="title" style={{ color: letter }}>
          {hostInitial(hostName)}
        </Text>
      )}
    </View>
  );
}
