import { useState, type ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import type { WireSessionLink } from '@botharness/host-protocol/wire';

import { edge, radius, rowGlyph, space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { AssignmentSessionIcon, ChevronDownIcon, ChevronRightIcon } from '../shell/icons';
import { useStrings } from '../strings';

export type SessionLinkNeed = keyof ReturnType<typeof useStrings>['sessionDetail']['linkNeeds'];

function Chip({
  icon: Icon,
  title,
  ...props
}: Pick<
  ComponentProps<typeof Pressable>,
  'testID' | 'onPress' | 'accessibilityLabel' | 'accessibilityState'
> & {
  icon: typeof AssignmentSessionIcon;
  title: string;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      android_ripple={{ color: pressTint(theme.color.fg) }}
      hitSlop={{ left: space.x2, right: space.x2, top: space.x1, bottom: space.x1 }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
        minWidth: 0,
        maxWidth: '100%',
        paddingHorizontal: space.x3,
        paddingVertical: space.x1,
        gap: space.x2,
        borderRadius: radius.xs,
        overflow: 'hidden',
        backgroundColor: pressed ? theme.layer.well.pressed : theme.layer.well.fill,
      })}
    >
      <Icon color={theme.color.muted} size={rowGlyph.size} />
      <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </Text>
    </Pressable>
  );
}

function Connector({ kind, first }: { kind: WireSessionLink['kind']; first: boolean }) {
  const theme = useDesignTheme();
  const color = theme.layer.raised.edge;
  if (!first && kind === 'created') return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        width: space.x3,
        top: first && kind === 'sent' ? '50%' : 0,
        bottom: first && kind === 'created' ? '50%' : 0,
        borderLeftWidth: edge.hairline,
        borderLeftColor: color,
        ...(first && kind === 'created'
          ? {
              borderBottomWidth: edge.hairline,
              borderBottomColor: color,
              borderBottomLeftRadius: radius.xs,
            }
          : null),
        ...(first && kind === 'sent'
          ? {
              borderTopWidth: edge.hairline,
              borderTopColor: color,
              borderTopLeftRadius: radius.xs,
            }
          : null),
      }}
    />
  );
}

export function SessionLinkChips({
  kind,
  links,
  needs,
  onOpen,
}: {
  kind: WireSessionLink['kind'];
  links: readonly WireSessionLink[];
  needs?: ReadonlyMap<string, SessionLinkNeed> | undefined;
  onOpen(link: WireSessionLink): void;
}) {
  const t = useStrings().sessionDetail;
  const [expanded, setExpanded] = useState(false);
  const own = links.filter((link) => link.kind === kind);
  if (own.length === 0) return null;

  const multiple = own.length > 1;
  const title = t.linkCount(kind, own.length);
  const rowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingLeft: space.x4,
    columnGap: space.x2,
  } as const;

  return (
    <View testID={`message-session-rail-${kind}`}>
      {multiple ? (
        <View style={rowStyle}>
          <Connector kind={kind} first />
          <Chip
            icon={expanded ? ChevronDownIcon : ChevronRightIcon}
            title={title}
            testID={`message-session-toggle-${kind}`}
            accessibilityLabel={title}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((previous) => !previous)}
          />
        </View>
      ) : null}
      {!multiple || expanded
        ? own.map((link) => {
            const need = needs?.get(link.sessionId);
            const warning = need === undefined ? undefined : t.linkNeeds[need];
            return (
              <View key={link.sessionId} style={[rowStyle, multiple && { paddingTop: space.x1 }]}>
                <Connector kind={kind} first={!multiple} />
                <Chip
                  icon={AssignmentSessionIcon}
                  title={link.title}
                  testID={`message-session-${link.sessionId}`}
                  accessibilityLabel={
                    warning === undefined
                      ? t.open(link.title)
                      : `${t.open(link.title)} · ${warning}`
                  }
                  onPress={() => onOpen(link)}
                />
                {warning === undefined ? null : (
                  <Text
                    accessible={false}
                    variant="meta"
                    tone="warning"
                    style={{ maxWidth: '50%', flexShrink: 1 }}
                  >
                    {warning}
                  </Text>
                )}
              </View>
            );
          })
        : null}
    </View>
  );
}
