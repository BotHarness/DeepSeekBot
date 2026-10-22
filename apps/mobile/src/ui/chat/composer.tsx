import { TextInput } from '../primitives/system-text';
import { useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreventRemove } from 'expo-router';

import type { PickSource, PickedFile } from '../../host/pick-files';
import { useDesignTheme } from '../design/theme';
import { edge, motion, radius, space } from '../design/tokens';
import { HardwareSend } from '../primitives/hardware-send';
import { Text } from '../primitives/text';
import {
  ArrowUpIcon,
  CameraIcon,
  ChevronUpIcon,
  CloseIcon,
  FileIcon,
  LockIcon,
  PhotoIcon,
  PlusIcon,
} from '../shell/icons';
import {
  ComposerCircleButton,
  ComposerFieldMaterial,
  composerBar,
  composerControl,
  composerPrimary,
} from './composer-chrome';
import { ComposerActionButton } from './composer-action';
import { VoiceButton } from './voice-button';
import { DraftEditor } from './draft-editor';
import { haptic } from '../haptics';
import { t } from '../strings';
import {
  composerActions,
  composerFieldHeight,
  composerStacked,
  dictating,
  type DictationStatus,
} from './dictation';

const SOURCES: Array<{ source: PickSource; label: string; Icon: typeof PhotoIcon }> = [
  { source: 'photos', label: t.attachPhotos, Icon: PhotoIcon },
  { source: 'camera', label: t.attachCamera, Icon: CameraIcon },
  { source: 'file', label: t.attachFile, Icon: FileIcon },
];

function AttachmentTile({ file, onRemove }: { file: PickedFile; onRemove(): void }) {
  const theme = useDesignTheme();
  const tile = theme.touch + space.x5;
  const badge = theme.type.meta.line + space.x1;
  return (
    <View style={{ paddingTop: space.x2, paddingRight: space.x2 }}>
      {file.kind === 'image' ? (
        <Image
          source={{ uri: file.uri }}
          accessibilityLabel={file.name}
          style={{
            width: tile,
            height: tile,
            borderRadius: radius.md,
            backgroundColor: theme.layer.raised.inset,
          }}
        />
      ) : (
        <View
          style={{
            minHeight: tile,
            paddingVertical: space.x3,
            maxWidth: tile * 3,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x2,
            paddingHorizontal: space.x3,
            borderRadius: radius.md,
            backgroundColor: theme.layer.raised.inset,
          }}
        >
          <FileIcon color={theme.color.muted} size={theme.type.title.line} />
          <Text variant="meta" numberOfLines={2} style={{ flexShrink: 1 }}>
            {file.name}
          </Text>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.removeAttachment(file.name)}
        onPress={onRemove}
        hitSlop={space.x3}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: badge,
          height: badge,
          borderRadius: radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: edge.focus,
          borderColor: theme.color.surface,
          backgroundColor: theme.color.fg,
        }}
      >
        <CloseIcon color={theme.color.base} size={theme.type.meta.size} />
      </Pressable>
    </View>
  );
}

function HoldDot({ size }: { size: number }) {
  const theme = useDesignTheme();
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: space.x3,
          height: space.x3,
          borderRadius: radius.round,
          backgroundColor: theme.color.danger,
        }}
      />
    </View>
  );
}

function LockHint({ style }: { style: ViewStyle }) {
  const theme = useDesignTheme();
  const size = composerControl(theme);
  return (
    <View
      style={[
        style,
        {
          width: size,
          paddingVertical: space.x3,
          gap: space.x2,
          alignItems: 'center',
          borderRadius: radius.round,
          borderWidth: edge.hairline,
          borderColor: theme.color.borderStrong,
          backgroundColor: theme.color.surface,
        },
      ]}
    >
      <LockIcon color={theme.color.muted} size={theme.type.title.line} />
      <ChevronUpIcon color={theme.color.subtle} size={theme.type.body.size} />
    </View>
  );
}

function AttachMenu({ onPick }: { onPick(source: PickSource): void }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        flexDirection: theme.largeText ? 'column' : 'row',
        gap: space.x3,
        justifyContent: 'space-around',
        paddingTop: space.x5,
        paddingBottom: space.x2,
      }}
    >
      {SOURCES.map(({ source, label, Icon }) => (
        <Pressable
          key={source}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => onPick(source)}
          style={({ pressed }) => ({
            alignItems: 'center',
            gap: space.x2,
            minWidth: theme.touch * 2,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View
            style={{
              width: theme.touch + space.x3,
              height: theme.touch + space.x3,
              borderRadius: radius.round,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.color.surface,
              borderWidth: edge.hairline,
              borderColor: theme.color.border,
            }}
          >
            <Icon color={theme.color.fg} size={theme.type.display.size} />
          </View>
          <Text variant="meta" tone="muted">
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export type ComposerInput = ComponentRef<typeof TextInput>;

export function Composer({
  value,
  placeholder,
  disabled,
  files,
  canAttach,
  dictation,
  canDictate,
  onChange,
  onSend,
  onPick,
  onRemove,
  onDictate,
  onStopDictation,
  onCancelDictation,
  footer,
  above,
  selection,
  onSelection,
  inputRef,
  onFocusChange,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  files: PickedFile[];
  canAttach: boolean;
  dictation: DictationStatus;
  canDictate: boolean;
  onChange(next: string): void;
  onSend(): void;
  onPick(source: PickSource): void;
  onRemove(id: string): void;
  onDictate(): void;
  onStopDictation(): void;
  onCancelDictation(): void;
  footer?: ReactNode;
  above?: ReactNode;
  selection?: { start: number; end: number } | undefined;
  onSelection?(caret: number): void;
  inputRef?: Ref<ComposerInput>;
  onFocusChange?(focused: boolean): void;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const [menu, setMenu] = useState(false);
  const [held, setHeld] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [pill, setPill] = useState({ width: 0, height: 0 });
  const [wraps, setWraps] = useState(false);
  const { height: viewportHeight } = useWindowDimensions();
  const [measuredLine, setMeasuredLine] = useState({ scale: 0, height: 0 });
  const textLine =
    measuredLine.scale === theme.fontScale
      ? measuredLine.height
      : theme.type.body.line * theme.fontScale;
  const bar = composerBar(theme);
  const integratedLeading = Platform.OS === 'ios';
  const lineHeight = Math.max(composerControl(theme), textLine);
  const fieldPadding = Math.max(space.x2, (lineHeight - textLine) / 2);
  const fieldLimit = Math.max(textLine + 2 * fieldPadding, viewportHeight / 5);
  const button = composerControl(theme);
  const inset = (bar - button) / 2;
  const corner = bar / 2;
  const pillHeight = useSharedValue(lineHeight + 2 * inset);
  const pillStyle = useAnimatedStyle(() => ({ height: pillHeight.value }));
  const settlePill = (next: number) => {
    if (pill.height === 0) pillHeight.value = next;
    else
      pillHeight.value = withTiming(next, {
        duration: motion.composer,
        reduceMotion: ReduceMotion.System,
      });
  };
  const listening = dictating(dictation);
  usePreventRemove(Platform.OS === 'android' && menu && canAttach && !listening, () =>
    setMenu(false),
  );
  const actions = composerActions({
    text: value,
    files: files.length,
    disabled,
    dictation,
    canDictate,
  });
  const canSend = actions.includes('send') && !disabled;
  const send = () => {
    if (!canSend) return;
    haptic('send');
    onSend();
  };
  const toggleMenu = () => {
    if (!menu) Keyboard.dismiss();
    setMenu(!menu);
  };
  const expanded = theme.largeText || wraps;
  const stacked = composerStacked(actions, files.length, expanded);
  const icon = theme.type.title.line;
  const leading = held ? (
    <HoldDot key="lead" size={integratedLeading ? button : bar} />
  ) : listening ? (
    <ComposerCircleButton
      key="lead"
      label={t.cancelDictation}
      symbol="xmark"
      testID="composer-dictation-cancel"
      size={integratedLeading ? button : bar}
      embedded={integratedLeading}
      onPress={onCancelDictation}
    >
      <CloseIcon color={theme.color.fg} size={icon} />
    </ComposerCircleButton>
  ) : canAttach ? (
    <ComposerCircleButton
      key="lead"
      label={menu ? t.closeAttach : t.attach}
      symbol={menu ? 'xmark' : 'plus'}
      size={integratedLeading ? button : bar}
      embedded={integratedLeading}
      testID="composer-attach"
      onPress={toggleMenu}
    >
      {menu ? (
        <CloseIcon color={theme.color.fg} size={icon} />
      ) : (
        <PlusIcon color={theme.color.fg} size={icon} />
      )}
    </ComposerCircleButton>
  ) : null;
  const field = (
    <TextInput
      key="field"
      ref={inputRef}
      testID="composer-input"
      value={value}
      onChangeText={onChange}
      {...(selection === undefined ? {} : { selection })}
      {...(onSelection === undefined
        ? {}
        : {
            onSelectionChange: (event: { nativeEvent: { selection: { end: number } } }) =>
              onSelection(event.nativeEvent.selection.end),
          })}
      onFocus={() => {
        setMenu(false);
        onFocusChange?.(true);
      }}
      onBlur={() => onFocusChange?.(false)}
      placeholder={
        held
          ? t.dictationHoldHint
          : dictation === 'starting'
            ? t.dictationStarting
            : listening
              ? t.dictationListening
              : placeholder
      }
      placeholderTextColor={theme.color.subtle}
      accessibilityLabel={placeholder}
      multiline
      editable={!listening}
      onContentSizeChange={(event) => setContentHeight(event.nativeEvent.contentSize.height)}
      style={{
        flex: 1,
        ...(expanded
          ? {
              minHeight: composerFieldHeight(contentHeight, textLine, fieldPadding, fieldLimit),
              maxHeight: composerFieldHeight(Infinity, textLine, fieldPadding, fieldLimit),
            }
          : { height: textLine + fieldPadding * 2 }),
        paddingVertical: fieldPadding,
        paddingHorizontal: space.x3,
        color: theme.color.fg,
        fontSize: theme.type.body.size,
        lineHeight: theme.type.body.line,
      }}
    />
  );
  const trailing = actions.map((action) =>
    action === 'send' ? (
      <ComposerActionButton
        key={action}
        label={t.send}
        symbol="arrow.up"
        testID="composer-send"
        filled
        disabled={!canSend}
        onPress={send}
      >
        <ArrowUpIcon color={composerPrimary(theme).ink} size={icon} />
      </ComposerActionButton>
    ) : (
      <VoiceButton
        key="voice"
        active={listening}
        onStart={() => {
          setMenu(false);
          onDictate();
        }}
        onStop={onStopDictation}
        onCancel={onCancelDictation}
        onHeld={setHeld}
      />
    ),
  );
  const leadingWidth = integratedLeading && leading !== null ? button + space.x2 : 0;
  const compactWidth =
    pill.width -
    2 * (inset + space.x3) -
    leadingWidth -
    (trailing.length === 0 ? 0 : button + space.x2);
  const expand =
    expanded && !listening ? (
      <ComposerActionButton
        symbol="chevron.up"
        testID="composer-expand"
        label={t.expandDraft}
        filled={false}
        onPress={() => setEditing(true)}
      >
        <ChevronUpIcon color={theme.color.muted} size={icon} />
      </ComposerActionButton>
    ) : null;
  return (
    <View
      style={{
        paddingHorizontal: space.x4,
        paddingTop: space.x3,
        paddingBottom: Math.max(insets.bottom, space.x3),
      }}
    >
      {editing ? (
        <DraftEditor
          value={value}
          placeholder={placeholder}
          canSend={canSend}
          showSend={actions.includes('send')}
          above={above}
          selection={selection}
          onSelection={onSelection}
          onChange={onChange}
          onClose={() => setEditing(false)}
          onSend={() => {
            if (!canSend) return;
            send();
            setEditing(false);
          }}
        />
      ) : null}
      {editing ? null : above}
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        onTextLayout={(event) => {
          const height = event.nativeEvent.lines[0]?.height;
          if (height !== undefined && height > 0)
            setMeasuredLine((current) =>
              current.scale === theme.fontScale && current.height === height
                ? current
                : { scale: theme.fontScale, height },
            );
        }}
        style={{ position: 'absolute', opacity: 0 }}
      >
        M
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.x3 }}>
        {integratedLeading ? null : leading}
        <Animated.View style={[{ flex: 1, borderRadius: corner, overflow: 'hidden' }, pillStyle]}>
          <ComposerFieldMaterial cornerRadius={corner} />
          <View
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              settlePill(height);
              setPill({ width, height });
            }}
          >
            {files.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: space.x4, paddingTop: space.x2 }}
              >
                {files.map((file) => (
                  <AttachmentTile key={file.id} file={file} onRemove={() => onRemove(file.id)} />
                ))}
              </ScrollView>
            ) : null}
            <View style={{ padding: inset }}>
              <HardwareSend
                enabled={canSend}
                enter
                onSend={send}
                style={{
                  flexDirection: 'row',
                  paddingLeft: stacked ? 0 : leadingWidth,
                  paddingRight: stacked || trailing.length === 0 ? 0 : button + space.x2,
                }}
              >
                {field}
              </HardwareSend>
              {stacked && expand === null && trailing.length === 0 && leadingWidth === 0 ? null : (
                <View
                  pointerEvents="box-none"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.x2,
                    ...(stacked
                      ? { paddingTop: space.x2 }
                      : { position: 'absolute', left: inset, right: inset, bottom: inset }),
                  }}
                >
                  {integratedLeading ? leading : null}
                  {expand}
                  <View pointerEvents="none" style={{ flex: 1 }} />
                  {trailing}
                </View>
              )}
            </View>
          </View>
          {compactWidth > 0 ? (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ position: 'absolute', opacity: 0, width: compactWidth, left: 0, top: 0 }}
            >
              <Text
                variant="body"
                onLayout={(event) => setWraps(event.nativeEvent.layout.height > textLine * 1.5)}
              >
                {value === '' ? ' ' : value}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </View>
      {footer === undefined ? null : (
        <View
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          style={{ paddingTop: space.x2 }}
        >
          {footer}
        </View>
      )}
      {held ? (
        <LockHint
          style={{
            position: 'absolute',
            right: space.x4 + inset,
            bottom:
              Math.max(insets.bottom, space.x3) +
              (footer === undefined ? 0 : footerHeight) +
              pill.height +
              space.x3,
          }}
        />
      ) : null}
      {menu && canAttach && !listening ? (
        <AttachMenu
          onPick={(source) => {
            setMenu(false);
            onPick(source);
          }}
        />
      ) : null}
    </View>
  );
}
