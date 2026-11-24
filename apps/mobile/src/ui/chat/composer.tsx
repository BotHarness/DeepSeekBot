import { TextInput } from '../primitives/system-text';
import {
  useCallback,
  useContext,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useChatBottom } from '../primitives/chat-keyboard';

import type { PickSource, PickedFile } from '../../host/pick-files';
import { pressTint, useDesignTheme } from '../design/theme';
import { spring } from '../design/motion';
import { clampScaledIconSize } from '../design/scaled-icon-size';
import { edge, radius, space } from '../design/tokens';
import { HardwareSend } from '../primitives/hardware-send';
import { Text } from '../primitives/text';
import {
  ArrowUpIcon,
  ChevronUpIcon,
  CloseIcon,
  FileIcon,
  LockIcon,
  PlusIcon,
  RecordingStopIcon,
} from '../shell/icons';
import {
  ComposerCircleButton,
  ComposerFieldMaterial,
  composerBar,
  composerPillShadow,
  composerControl,
  composerPrimary,
} from './composer-chrome';
import { composerRows, composerSlots, type ComposerSession } from './composer-layout';
import { ComposerActionButton } from './composer-action';
import { ComposerPillContext } from './composer-pill';
import { VoiceButton } from './voice-button';
import { ComposerHold } from './composer-hold';
import { DraftEditor } from './draft-editor';
import { haptic } from '../haptics';
import { PlusMenuButton } from '../primitives/plus-menu-button';
import { useStrings } from '../strings';
import {
  composerActions,
  composerFieldHeight,
  composerStacked,
  dictating,
  type DictationStatus,
} from './dictation';

function AttachmentTile({ file, onRemove }: { file: PickedFile; onRemove(): void }) {
  const t = useStrings();
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
          <FileIcon
            color={theme.color.muted}
            size={clampScaledIconSize(theme.type.title.line, theme.fontScale, tile - space.x3 * 2)}
          />
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
        android_ripple={{ color: pressTint(theme.color.base) }}
        style={({ pressed }) => ({
          position: 'absolute',
          top: 0,
          right: 0,
          width: badge,
          height: badge,
          borderRadius: radius.round,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: edge.focus,
          borderColor: theme.color.surface,
          backgroundColor: pressed ? theme.color.muted : theme.color.fg,
        })}
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

export type ComposerInput = ComponentRef<typeof TextInput>;

export function Composer({
  value,
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
  inside,
  selection,
  onSelection,
  inputRef,
  onFocusChange,
  sessionControls,
}: {
  value: string;
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
  inside?: ReactNode;
  selection?: { start: number; end: number } | undefined;
  onSelection?(caret: number): void;
  inputRef?: Ref<ComposerInput>;
  onFocusChange?(focused: boolean): void;
  sessionControls?:
    | {
        render(width: number): ReactNode;
        renderCompact?: (() => ReactNode) | undefined;
        blocksSend: boolean;
        onStop?: (() => void) | undefined;
        stopping: boolean;
      }
    | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const bottomInset = useChatBottom().safe;
  const [footerHeight, setFooterHeight] = useState(0);
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
  const integratedLeading = Platform.OS === 'ios' || Platform.OS === 'android';
  const lineHeight = Math.max(composerControl(theme), textLine);
  const fieldPadding = Math.max(space.x2, (lineHeight - textLine) / 2);
  const fieldLimit = Math.max(textLine + 2 * fieldPadding, viewportHeight / 5);
  const button = composerControl(theme);
  const inset = (bar - button) / 2;
  const corner = bar / 2;
  const expanded = theme.largeText || (wraps && value !== '');
  const session: ComposerSession =
    sessionControls === undefined
      ? 'none'
      : sessionControls.renderCompact === undefined
        ? 'stacked'
        : 'compact';
  const restingHeight =
    lineHeight +
    2 * inset +
    (composerRows({ session, expanded, stackedByContent: false }).sessionRow
      ? button + space.x2
      : 0);
  const ownPill = useSharedValue(restingHeight);
  const sharedPill = useContext(ComposerPillContext);
  const pillHeight = sharedPill?.height ?? ownPill;
  const pillRest = useRef(restingHeight);
  pillRest.current = restingHeight;
  const pillStyle = useAnimatedStyle(() => ({ height: pillHeight.value }));
  const holdPill = useCallback(
    (node: unknown) => {
      if (node !== null && sharedPill !== undefined && sharedPill.height.value === 0)
        sharedPill.height.value = pillRest.current;
      return () => {
        sharedPill?.layout(0);
        if (sharedPill !== undefined) sharedPill.height.value = 0;
      };
    },
    [sharedPill],
  );
  const settlePill = (next: number) => {
    if (pill.height === 0) pillHeight.value = next;
    else pillHeight.value = withSpring(next, spring.spatial.default);
  };
  const listening = dictating(dictation);
  if (held && !listening) setHeld(false);
  const actions = composerActions({
    text: value,
    files: files.length,
    disabled,
    dictation,
    canDictate,
    keepDisabledMic: Platform.OS === 'android',
  });
  const canSend = actions.includes('send') && !disabled && sessionControls?.blocksSend !== true;
  const send = () => {
    if (!canSend) return;
    haptic('send');
    onSend();
  };
  const { stacked, sessionCompact } = composerRows({
    session,
    expanded,
    stackedByContent: composerStacked(actions, files.length, expanded),
  });
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
    <PlusMenuButton
      key="lead"
      label={t.attach}
      testID="composer-attach"
      size={integratedLeading ? button : bar}
      embedded={integratedLeading}
      items={[
        {
          id: 'composer-attach-photos',
          label: t.attachPhotos,
          symbol: 'photo',
          run: () => onPick('photos'),
        },
        {
          id: 'composer-attach-camera',
          label: t.attachCamera,
          symbol: 'camera',
          run: () => onPick('camera'),
        },
        {
          id: 'composer-attach-file',
          label: t.attachFile,
          symbol: 'folder',
          run: () => onPick('file'),
        },
      ]}
    />
  ) : sessionControls !== undefined ? (
    <ComposerActionButton
      key="lead"
      label={t.attach}
      symbol="plus"
      testID="composer-attach"
      filled={false}
      disabled
      onPress={() => onPick('file')}
    >
      <PlusIcon color={theme.color.subtle} size={icon} />
    </ComposerActionButton>
  ) : null;
  const placeholder = held
    ? Platform.OS === 'android' || Platform.OS === 'ios'
      ? t.dictationReleaseHint
      : t.dictationHoldHint
    : dictation === 'starting'
      ? t.dictationStarting
      : listening
        ? t.dictationListening
        : '';
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
        onFocusChange?.(true);
      }}
      onBlur={() => onFocusChange?.(false)}
      placeholder={placeholder}
      placeholderTextColor={theme.color.subtle}
      accessibilityLabel={t.messagePlaceholder}
      accessibilityHint={
        integratedLeading && canDictate && !disabled ? t.composerInputHint : undefined
      }
      multiline
      editable={!listening}
      onContentSizeChange={(event) => setContentHeight(event.nativeEvent.contentSize.height)}
      style={{
        flex: 1,
        ...(expanded && (value !== '' || placeholder !== '')
          ? {
              minHeight: composerFieldHeight(
                value === '' ? 0 : contentHeight,
                textLine,
                fieldPadding,
                fieldLimit,
              ),
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
  const trailingActions =
    sessionControls !== undefined && actions.length === 0 && sessionControls.onStop === undefined
      ? ['send' as const]
      : actions;
  const trailing = trailingActions.map((action) =>
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
        disabled={disabled && !listening}
        onStart={() => {
          onDictate();
        }}
        onStop={onStopDictation}
        onCancel={onCancelDictation}
        onHeld={setHeld}
      />
    ),
  );
  const slot = button + space.x2;
  const leadingWidth = integratedLeading && leading !== null ? slot : 0;
  const stop =
    sessionControls?.onStop === undefined ? null : (
      <ComposerActionButton
        label={sessionControls.stopping ? t.sessionStopping : t.sessionStop}
        symbol="stop.fill"
        testID="composer-session-stop"
        filled={trailing.length === 0}
        disabled={sessionControls.stopping}
        onPress={sessionControls.onStop}
      >
        <RecordingStopIcon
          color={trailing.length === 0 ? composerPrimary(theme).ink : theme.color.fg}
          size={icon}
        />
      </ComposerActionButton>
    );
  const slots = composerSlots({
    session,
    slot,
    leading: leadingWidth,
    trailing: trailing.length,
    stop: stop !== null,
  });
  const compactWidth =
    pill.width - 2 * (inset + space.x3) - (slots.measured ? slots.left + slots.right : 0);
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
        paddingBottom: Math.max(bottomInset, space.x3),
      }}
    >
      {editing ? (
        <DraftEditor
          value={value}
          canSend={canSend}
          showSend={actions.includes('send')}
          pinned={inside}
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
        <Animated.View
          ref={holdPill}
          onLayout={(event) => sharedPill?.layout(event.nativeEvent.layout.height)}
          style={[
            {
              flex: 1,
              borderRadius: corner,
              overflow: 'hidden',
              boxShadow: composerPillShadow(theme),
            },
            pillStyle,
          ]}
        >
          <ComposerFieldMaterial cornerRadius={corner} />
          <View
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              settlePill(height);
              setPill({ width, height });
            }}
          >
            {inside === undefined || editing ? null : (
              <View style={{ paddingTop: space.x2 }}>{inside}</View>
            )}
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
                  paddingLeft: stacked ? 0 : slots.left,
                  paddingRight: stacked ? 0 : slots.right,
                }}
              >
                <ComposerHold
                  enabled={canDictate && !disabled && (!listening || held)}
                  onStart={() => {
                    setHeld(true);
                    onDictate();
                  }}
                  onStop={() => {
                    setHeld(false);
                    onStopDictation();
                  }}
                >
                  {field}
                </ComposerHold>
              </HardwareSend>
              {sessionControls === undefined &&
              stacked &&
              expand === null &&
              trailing.length === 0 &&
              leadingWidth === 0 ? null : (
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
                  {trailing.length === 0 ? null : stop}
                  <View pointerEvents="none" style={{ flex: 1 }} />
                  {sessionCompact
                    ? sessionControls?.renderCompact?.()
                    : sessionControls?.render(pill.width)}
                  {trailing.length === 0 ? stop : trailing}
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
      {held && Platform.OS !== 'android' ? (
        <LockHint
          style={{
            position: 'absolute',
            right: space.x4 + inset,
            bottom:
              Math.max(bottomInset, space.x3) +
              (footer === undefined ? 0 : footerHeight) +
              pill.height +
              space.x3,
          }}
        />
      ) : null}
    </View>
  );
}
