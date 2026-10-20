import { TextInput } from '../primitives/system-text';
import { useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  Image,
  Keyboard,
  PanResponder,
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

import type { PickSource, PickedFile } from '../../host/pick-files';
import { pressTint, useDesignTheme } from '../design/theme';
import { edge, motion, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import {
  ArrowUpIcon,
  CameraIcon,
  ChevronUpIcon,
  CloseIcon,
  FileIcon,
  LockIcon,
  MicIcon,
  PhotoIcon,
  PlusIcon,
  RecordingStopIcon,
} from '../shell/icons';
import {
  ComposerCircleButton,
  ComposerFieldMaterial,
  composerBar,
  composerPrimary,
  micAlwaysFilled,
  rippleFeedback,
} from './composer-chrome';
import { DraftEditor } from './draft-editor';
import { haptic } from '../haptics';
import { t } from '../strings';
import {
  composerActions,
  composerFieldHeight,
  composerStacked,
  dictating,
  voiceDrag,
  voiceRelease,
  type DictationStatus,
} from './dictation';

const SOURCES: Array<{ source: PickSource; label: string; Icon: typeof PhotoIcon }> = [
  { source: 'photos', label: t.attachPhotos, Icon: PhotoIcon },
  { source: 'camera', label: t.attachCamera, Icon: CameraIcon },
  { source: 'file', label: t.attachFile, Icon: FileIcon },
];

function RoundButton({
  label,
  filled,
  onPress,
  testID,
  children,
}: {
  label: string;
  filled: boolean;
  onPress(): void;
  testID?: string;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const size = theme.touch - space.x4;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={space.x2}
      android_ripple={
        rippleFeedback
          ? {
              color: pressTint(filled ? composerPrimary(theme).ink : theme.color.fg),
              borderless: true,
              radius: size / 2,
            }
          : undefined
      }
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled
          ? composerPrimary(theme).fill
          : pressed && !rippleFeedback
            ? pressTint(theme.color.fg)
            : undefined,
        opacity: filled && pressed && !rippleFeedback ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

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

function VoiceButton({
  active,
  onStart,
  onStop,
  onCancel,
  onHeld,
}: {
  active: boolean;
  onStart(): void;
  onStop(): void;
  onCancel(): void;
  onHeld(held: boolean): void;
}) {
  const theme = useDesignTheme();
  const [held, setHeld] = useState(false);
  const size = theme.touch - space.x4;
  const latest = useRef({ active, onStart, onStop, onCancel, onHeld });
  latest.current = { active, onStart, onStop, onCancel, onHeld };
  const gesture = useRef({ at: 0, startedHere: false, done: false });
  const hold = (next: boolean) => {
    setHeld(next);
    latest.current.onHeld(next);
  };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const startedHere = !latest.current.active;
        gesture.current = { at: Date.now(), startedHere, done: false };
        if (!startedHere) return;
        latest.current.onStart();
        hold(true);
      },
      onPanResponderMove: (_event, { dx, dy }) => {
        const current = gesture.current;
        if (!current.startedHere || current.done) return;
        const drag = voiceDrag(dx, dy);
        if (drag === undefined) return;
        current.done = true;
        hold(false);
        if (drag === 'cancel') latest.current.onCancel();
      },
      onPanResponderRelease: () => {
        const current = gesture.current;
        hold(false);
        if (current.done) return;
        if (!current.startedHere) latest.current.onStop();
        else if (voiceRelease(Date.now() - current.at) === 'stop') latest.current.onStop();
      },
      onPanResponderTerminate: () => hold(false),
    }),
  ).current;
  const filled = micAlwaysFilled || active || held;
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={active ? t.stopDictation : t.dictate}
      accessibilityHint={active ? undefined : t.dictateHint}
      onAccessibilityTap={() => (latest.current.active ? onStop() : onStart())}
      hitSlop={space.x2}
      style={{
        width: size,
        height: size,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? composerPrimary(theme).fill : undefined,
      }}
    >
      {active && !held ? (
        <RecordingStopIcon color={composerPrimary(theme).ink} size={theme.type.title.line} />
      ) : (
        <MicIcon
          color={filled ? composerPrimary(theme).ink : theme.color.muted}
          size={theme.type.title.line}
        />
      )}
    </View>
  );
}

function HoldDot() {
  const theme = useDesignTheme();
  const size = composerBar(theme);
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
  const size = theme.touch - space.x4;
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
  const lineHeight = Math.max(theme.touch - space.x4, textLine);
  const fieldPadding = Math.max(space.x2, (lineHeight - textLine) / 2);
  const fieldLimit = Math.max(textLine + 2 * fieldPadding, viewportHeight / 5);
  const button = theme.touch - space.x4;
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
  const actions = composerActions({
    text: value,
    files: files.length,
    disabled,
    dictation,
    canDictate,
  });
  const toggleMenu = () => {
    if (!menu) Keyboard.dismiss();
    setMenu(!menu);
  };
  const expanded = theme.largeText || wraps;
  const stacked = composerStacked(actions, files.length, expanded);
  const icon = theme.type.title.line;
  const leading = held ? (
    <HoldDot key="lead" />
  ) : listening ? (
    <ComposerCircleButton
      key="lead"
      label={t.cancelDictation}
      size={bar}
      onPress={onCancelDictation}
    >
      <CloseIcon color={theme.color.fg} size={icon} />
    </ComposerCircleButton>
  ) : canAttach ? (
    <ComposerCircleButton
      key="lead"
      label={menu ? t.closeAttach : t.attach}
      size={bar}
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
      <RoundButton
        key={action}
        label={t.send}
        testID="composer-send"
        filled
        onPress={() => {
          haptic('send');
          onSend();
        }}
      >
        <ArrowUpIcon color={composerPrimary(theme).ink} size={icon} />
      </RoundButton>
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
  const compactWidth =
    pill.width - 2 * (inset + space.x3) - (trailing.length === 0 ? 0 : button + space.x2);
  const expand =
    expanded && !listening ? (
      <RoundButton label={t.expandDraft} filled={false} onPress={() => setEditing(true)}>
        <ChevronUpIcon color={theme.color.muted} size={icon} />
      </RoundButton>
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
          canSend={actions.includes('send')}
          above={above}
          selection={selection}
          onSelection={onSelection}
          onChange={onChange}
          onClose={() => setEditing(false)}
          onSend={() => {
            haptic('send');
            onSend();
            setEditing(false);
          }}
        />
      ) : null}
      {editing ? null : above}
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
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
        {leading}
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
              <View
                style={{
                  flexDirection: 'row',
                  paddingRight: stacked || trailing.length === 0 ? 0 : button + space.x2,
                }}
              >
                {field}
              </View>
              {stacked && expand === null && trailing.length === 0 ? null : (
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
                  {expand}
                  <View pointerEvents="none" style={{ flex: 1 }} />
                  {trailing}
                </View>
              )}
            </View>
          </View>
          {compactWidth > 0 ? (
            <Text
              variant="body"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onLayout={(event) => setWraps(event.nativeEvent.layout.height > textLine * 1.5)}
              style={{ position: 'absolute', opacity: 0, width: compactWidth, left: 0, top: 0 }}
            >
              {value === '' ? ' ' : value}
            </Text>
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
