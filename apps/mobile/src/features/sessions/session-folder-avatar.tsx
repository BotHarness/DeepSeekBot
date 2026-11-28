import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { HostClient } from '@botharness/host-client/client';
import {
  HOST_SYMBOL_IDS,
  hostColorInk,
  hostTileFill,
  type HostColorId,
  type HostSymbolId,
} from '@botharness/host-client/ui/design/host-look';
import type { HostSessionFolderLook } from '@botharness/host-protocol/host-sessions';
import { useDesignTheme } from '../../ui/design/theme';
import { cornerBadge } from '../../ui/design/tokens';
import { ResourceImage } from '../../ui/primitives/resource-image';
import { Text } from '../../ui/primitives/text';
import { HostGlyph } from '../../ui/shell/host-tile';
import { folderMonogram, sessionColorId, sessionFolderColor } from './session-query-model';

const FAVICON_SHARE = 0.62;
const GLYPH_SHARE = 0.58;

function lookSymbol(look: HostSessionFolderLook | undefined): HostSymbolId | undefined {
  const icon = look?.icon;
  return icon?.kind === 'symbol' && (HOST_SYMBOL_IDS as readonly string[]).includes(icon.id)
    ? (icon.id as HostSymbolId)
    : undefined;
}

export function SessionFolderAvatar({
  folderName,
  size,
  corner,
  colorId: assigned,
  look,
  client,
  testID,
}: {
  folderName: string | undefined;
  size: number;
  corner: number;
  colorId?: HostColorId | undefined;
  look?: HostSessionFolderLook | undefined;
  client?: Pick<HostClient, 'resource'> | undefined;
  testID?: string;
}) {
  const theme = useDesignTheme();
  const chosenColor = sessionColorId(look?.color);
  const chosen = look?.icon !== undefined || chosenColor !== undefined;
  const source =
    !chosen && look?.favicon !== undefined ? client?.resource(look.favicon) : undefined;
  const uri = source?.uri;
  const sourceIdentity = useMemo(() => ({ client, uri }), [client, uri]);
  const [failedSource, setFailedSource] = useState<typeof sourceIdentity>();
  const favicon = sourceIdentity === failedSource ? undefined : source;
  const colorId = sessionFolderColor(folderName, chosenColor, assigned);
  const ink = hostColorInk(theme.scheme, theme.color, colorId);
  const symbol = lookSymbol(look);
  const emoji = look?.icon?.kind === 'emoji' ? look.icon.emoji : undefined;
  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: corner,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor:
          favicon !== undefined
            ? theme.layer.canvas.inset
            : hostTileFill(theme.scheme, theme.color, colorId, theme.color.base),
      }}
    >
      {favicon !== undefined ? (
        <ResourceImage
          testID={testID === undefined ? undefined : `${testID}-favicon`}
          source={favicon}
          onError={() => setFailedSource(sourceIdentity)}
          contentFit="contain"
          style={{ width: size * FAVICON_SHARE, height: size * FAVICON_SHARE }}
        />
      ) : symbol !== undefined ? (
        <HostGlyph
          icon={{ kind: 'symbol', id: symbol }}
          size={Math.round(size * GLYPH_SHARE)}
          color={ink}
        />
      ) : emoji !== undefined ? (
        <HostGlyph
          icon={{ kind: 'emoji', emoji }}
          size={Math.round(size * GLYPH_SHARE)}
          color={ink}
        />
      ) : (
        <Text
          strong
          variant="meta"
          numberOfLines={1}
          maxFontSizeMultiplier={Math.max(cornerBadge.maxTextScale, size / theme.touch)}
          style={{ color: ink }}
        >
          {folderMonogram(folderName)}
        </Text>
      )}
    </View>
  );
}
