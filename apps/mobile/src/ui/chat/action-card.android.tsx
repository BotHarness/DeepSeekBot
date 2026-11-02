import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  Box,
  Card,
  Column,
  FlowRow,
  Host,
  Icon,
  Row,
  Text,
  TextButton,
  TextField,
  useNativeState,
} from '@expo/ui/jetpack-compose';
import {
  background,
  clip,
  fillMaxWidth,
  padding,
  paddingAll,
  semantics,
  Shapes,
  testID as composeTestID,
} from '@expo/ui/jetpack-compose/modifiers';

import { materialType, useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { ComposeTreeContext } from '../primitives/compose-tree';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { ROW_ICON_SOURCES } from '../primitives/row-icon-source.android';
import { useStrings } from '../strings';
import type {
  ActionCard as SharedActionCard,
  CardField as SharedCardField,
  CardNote as SharedCardNote,
  CardPreview as SharedCardPreview,
} from './action-card';

type Props<T extends (...args: never[]) => unknown> = Parameters<T>[0];

function Well({ children }: { children: ReactNode }) {
  const roles = useMaterialRoles();
  return (
    <Column
      verticalArrangement={{ spacedBy: space.x4 }}
      modifiers={[
        fillMaxWidth(),
        clip(Shapes.RoundedCorner(radius.md)),
        background(roles.surfaceContainerLow),
        padding(space.x4, space.x3, space.x4, space.x3),
      ]}
    >
      {children}
    </Column>
  );
}

function StatusPill({ label }: { label: string }) {
  const theme = useDesignTheme();
  return (
    <Box
      modifiers={[
        clip(Shapes.RoundedCorner(radius.round)),
        background(theme.color.warningSoft),
        padding(space.x4, space.x1, space.x4, space.x1),
      ]}
    >
      <Text
        color={theme.color.warning}
        style={{ typography: materialType.meta, fontWeight: 'bold' }}
      >
        {label}
      </Text>
    </Box>
  );
}

function Details({ children }: { children: ReactNode }) {
  const t = useStrings();
  const [open, setOpen] = useState(false);
  return (
    <Column verticalArrangement={{ spacedBy: space.x2 }} modifiers={[fillMaxWidth()]}>
      <TextButton onClick={() => setOpen(!open)} modifiers={[composeTestID('action-card-details')]}>
        <Row horizontalArrangement={{ spacedBy: space.x2 }} verticalAlignment="center">
          <Text>{t.details}</Text>
          <Icon
            source={ROW_ICON_SOURCES[open ? 'collapse' : 'expand']}
            size={space.x5 + space.x1}
          />
        </Row>
      </TextButton>
      {open ? <Well>{children}</Well> : null}
    </Column>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  const roles = useMaterialRoles();
  return (
    <Column verticalArrangement={{ spacedBy: space.x1 }}>
      {label === '' ? null : (
        <Text color={roles.onSurfaceVariant} style={{ typography: materialType.meta }}>
          {label}
        </Text>
      )}
      <Text style={{ typography: materialType.meta, fontFamily: 'monospace' }}>{value}</Text>
    </Column>
  );
}

export function CardNote({ children, variant = 'note' }: Props<typeof SharedCardNote>) {
  const roles = useMaterialRoles();
  return variant === 'note' ? (
    <Text color={roles.onSurfaceVariant} style={{ typography: materialType.meta }}>
      {children}
    </Text>
  ) : (
    <Text style={{ typography: materialType.body }}>{children}</Text>
  );
}

export function CardPreview({
  text,
  well = true,
  mono = false,
  variant = 'meta',
  tone = 'fg',
  maxLines,
}: Props<typeof SharedCardPreview>) {
  const roles = useMaterialRoles();
  const body = (
    <Text
      {...(tone === 'muted' ? { color: roles.onSurfaceVariant } : {})}
      {...(maxLines === undefined ? {} : { maxLines, overflow: 'ellipsis' as const })}
      style={{
        typography: variant === 'meta' ? materialType.meta : materialType.body,
        ...(mono ? { fontFamily: 'monospace' } : {}),
      }}
    >
      {text}
    </Text>
  );
  return well ? <Well>{body}</Well> : body;
}

export function CardGroup({ children }: { children: ReactNode }) {
  return (
    <Column verticalArrangement={{ spacedBy: space.x5 }} modifiers={[fillMaxWidth()]}>
      {children}
    </Column>
  );
}

export function CardField({
  label,
  accessibilityLabel = label,
  placeholder = label,
  value,
  editable = true,
  testID,
  onChangeText,
}: Props<typeof SharedCardField>) {
  const text = useNativeState(value);
  const echoes = useRef<string[]>([]);
  useLayoutEffect(() => {
    const echoed = echoes.current.indexOf(value);
    if (echoed >= 0) echoes.current.splice(0, echoed + 1);
    else if (text.get() !== value) text.set(value);
  }, [text, value]);
  return (
    <TextField
      value={text}
      onValueChange={(next) => {
        echoes.current.push(next);
        onChangeText(next);
      }}
      enabled={editable}
      minLines={2}
      modifiers={[
        fillMaxWidth(),
        semantics({ contentDescription: accessibilityLabel }),
        ...(testID === undefined ? [] : [composeTestID(testID)]),
      ]}
    >
      <TextField.Label>
        <Text>{label}</Text>
      </TextField.Label>
      {placeholder === label ? null : (
        <TextField.Placeholder>
          <Text>{placeholder}</Text>
        </TextField.Placeholder>
      )}
    </TextField>
  );
}

export function CardButtons({ children, stack = false }: { children: ReactNode; stack?: boolean }) {
  return stack ? (
    <ComposeTreeContext.Provider value={{ fill: true }}>
      <Column verticalArrangement={{ spacedBy: space.x3 }} modifiers={[fillMaxWidth()]}>
        {children}
      </Column>
    </ComposeTreeContext.Provider>
  ) : (
    <ComposeTreeContext.Provider value={{ fill: false }}>
      <FlowRow
        horizontalArrangement={{ spacedBy: space.x3 }}
        verticalArrangement={{ spacedBy: space.x3 }}
        modifiers={[fillMaxWidth()]}
      >
        {children}
      </FlowRow>
    </ComposeTreeContext.Provider>
  );
}

export function ActionCard({
  category,
  status,
  title,
  preview,
  details,
  focused = false,
  error,
  busy = false,
  wide = false,
  children,
}: Props<typeof SharedActionCard>) {
  const theme = useDesignTheme();
  const roles = useMaterialRoles();
  return (
    <View style={{ paddingHorizontal: space.x4, paddingTop: space.x3 }}>
      <Host
        matchContents={{ vertical: true }}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        ignoreSafeAreaKeyboardInsets
        style={{ width: wide ? '100%' : '92%' }}
      >
        <ComposeTreeContext.Provider value={{ fill: true }}>
          <Card
            {...(focused ? { border: { width: edge.focus, color: theme.color.accent } } : {})}
            modifiers={[fillMaxWidth(), composeTestID('action-card')]}
          >
            <Column
              verticalArrangement={{ spacedBy: space.x4 }}
              modifiers={[fillMaxWidth(), paddingAll(space.x5)]}
            >
              <Column verticalArrangement={{ spacedBy: space.x2 }} modifiers={[fillMaxWidth()]}>
                <FlowRow
                  horizontalArrangement="spaceBetween"
                  verticalArrangement={{ spacedBy: space.x2 }}
                  modifiers={[fillMaxWidth()]}
                >
                  <Text style={{ typography: 'titleSmall', fontWeight: 'bold' }}>{category}</Text>
                  {status === undefined ? null : <StatusPill label={status} />}
                </FlowRow>
                <Text style={{ typography: 'bodyLarge' }}>{title}</Text>
              </Column>
              {preview}
              {details === undefined ? null : <Details>{details}</Details>}
              {busy ? <LoadingIndicator /> : children}
              {error === undefined ? null : (
                <Text color={roles.error} style={{ typography: materialType.meta }}>
                  {error}
                </Text>
              )}
            </Column>
          </Card>
        </ComposeTreeContext.Provider>
      </Host>
    </View>
  );
}
