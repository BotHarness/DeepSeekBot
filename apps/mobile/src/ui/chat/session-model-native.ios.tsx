import {
  BottomSheet,
  Button,
  Group,
  HStack,
  Host,
  Image,
  List,
  NavigationStack,
  ProgressView,
  RNHostView,
  Section,
  Spacer,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  disabled,
  font,
  foregroundStyle,
  frame,
  listStyle,
  navigationBarTitleDisplayMode,
  navigationTitle,
  presentationDetents,
  presentationDragIndicator,
  redacted,
  scrollContentBackground,
} from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { PlatformColor, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { ModelBrandIcon } from './model-brand-icon';
import type { SessionModelSheetProps } from './session-model-native';

export function NativeSessionModelSheet({
  visible,
  title,
  closeLabel,
  note,
  failure,
  retryLabel,
  sections,
  current,
  saving,
  savingLabel,
  loading,
  onClose,
  onRetry,
  onChoose,
}: SessionModelSheetProps) {
  const theme = useDesignTheme();
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);
  if (!shown) return null;
  const icon = theme.type.title.line;
  return (
    <Host colorScheme={theme.scheme} pointerEvents="none" style={{ position: 'absolute' }}>
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(presented) => {
          if (!presented) onClose();
        }}
        onDismiss={() => setShown(false)}
      >
        <Group
          modifiers={[
            presentationDetents(['medium', 'large']),
            presentationDragIndicator('visible'),
          ]}
        >
          <NavigationStack>
            <Toolbar>
              <List
                modifiers={[
                  listStyle('insetGrouped'),
                  scrollContentBackground('hidden'),
                  navigationTitle(title),
                  navigationBarTitleDisplayMode('inline'),
                ]}
              >
                {failure !== undefined ? (
                  <Section footer={<Text>{failure}</Text>}>
                    <Button label={retryLabel} onPress={onRetry} />
                  </Section>
                ) : null}
                {note === undefined ? null : (
                  <Section>
                    <Text modifiers={[foregroundStyle(PlatformColor('secondaryLabel'))]}>
                      {note}
                    </Text>
                  </Section>
                )}
                {loading
                  ? [0, 1].map((group) => (
                      <Section key={group}>
                        {[0, 1, 2].map((row) => (
                          <Text key={row} modifiers={[redacted('placeholder')]}>
                            {title}
                          </Text>
                        ))}
                      </Section>
                    ))
                  : sections
                      .filter((section) => section.data.length > 0)
                      .map((section, index) => (
                        <Section
                          key={section.title || `section-${index}`}
                          {...(section.title ? { title: section.title } : {})}
                        >
                          {section.data.map((item) => {
                            const selected = current === item.key;
                            return (
                              <Button
                                key={item.key}
                                onPress={() => onChoose(item.key)}
                                modifiers={[
                                  accessibilityLabel(item.accessible),
                                  disabled(item.disabled === true || saving !== undefined),
                                ]}
                              >
                                <HStack spacing={12}>
                                  <RNHostView matchContents>
                                    <View style={{ width: icon, height: icon }}>
                                      <ModelBrandIcon
                                        brand={item.brand}
                                        size={icon}
                                        color={theme.color.muted}
                                      />
                                    </View>
                                  </RNHostView>
                                  <VStack alignment="leading" spacing={2}>
                                    <Text
                                      modifiers={[
                                        foregroundStyle(
                                          PlatformColor(item.disabled ? 'tertiaryLabel' : 'label'),
                                        ),
                                      ]}
                                    >
                                      {item.name}
                                    </Text>
                                    {item.detail === undefined && saving !== item.key ? null : (
                                      <Text
                                        modifiers={[
                                          font({ textStyle: 'footnote' }),
                                          foregroundStyle(PlatformColor('secondaryLabel')),
                                        ]}
                                      >
                                        {saving === item.key ? savingLabel : (item.detail ?? '')}
                                      </Text>
                                    )}
                                  </VStack>
                                  <Spacer />
                                  {item.tag === undefined ? null : (
                                    <Text
                                      modifiers={[
                                        font({ textStyle: 'footnote' }),
                                        foregroundStyle(PlatformColor('secondaryLabel')),
                                      ]}
                                    >
                                      {item.tag}
                                    </Text>
                                  )}
                                  {saving === item.key ? (
                                    <ProgressView />
                                  ) : selected ? (
                                    <Image
                                      systemName="checkmark"
                                      modifiers={[font({ textStyle: 'body', weight: 'semibold' })]}
                                      color={theme.color.accent}
                                    />
                                  ) : (
                                    <Spacer modifiers={[frame({ width: 0 })]} />
                                  )}
                                </HStack>
                              </Button>
                            );
                          })}
                        </Section>
                      ))}
              </List>
              <Toolbar.Content>
                <ToolbarItem placement="cancellationAction">
                  <Button
                    role="close"
                    systemImage="xmark"
                    onPress={onClose}
                    modifiers={[accessibilityLabel(closeLabel)]}
                  />
                </ToolbarItem>
              </Toolbar.Content>
            </Toolbar>
          </NavigationStack>
        </Group>
      </BottomSheet>
    </Host>
  );
}
