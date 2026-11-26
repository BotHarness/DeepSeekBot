import { useRef, useState } from 'react';
import { AccessibilityInfo, Platform, ToastAndroid, View, type ViewInstance } from 'react-native';

import type { ApprovalTemplates } from '@botharness/host-client/bot-settings';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Text } from '../primitives/text';
import { errorText } from '../request-parts';
import { useStrings } from '../strings';
import { templateChoices, type ApprovalPresetPort, type PresetOption } from './approval-preset';
import { ApprovalPresetPicker } from './approval-preset-picker';

function presetMenu(presets: ApprovalTemplates, inheritTitle: string) {
  const choices = templateChoices(presets, inheritTitle);
  const options = [
    choices.inherit,
    ...choices.templates,
    ...(choices.missing === undefined ? [] : [choices.missing]),
    choices.off,
  ];
  return { options, name: options.find((option) => option.selected)?.title ?? '' };
}

export function ApprovalPresetRow({ port }: { port: ApprovalPresetPort }) {
  const t = useStrings();
  const [presets, setPresets] = useState<ApprovalTemplates>();
  const [busy, setBusy] = useState(false);
  const [switched, setSwitched] = useState(false);
  const [error, setError] = useState<string>();
  const [width, setWidth] = useState(0);
  const generation = useRef(0);
  const reads = useRef(0);
  const mount = useMounted<ViewInstance>(() => {
    const run = ++generation.current;
    setPresets(undefined);
    setSwitched(false);
    setBusy(false);
    setError(undefined);
    const read = (): void => {
      const seq = ++reads.current;
      port.load().then(
        (next) => {
          if (generation.current === run && reads.current === seq) setPresets(next);
        },
        () => undefined,
      );
    };
    read();
    const stop = port.subscribe?.(read);
    return () => {
      stop?.();
      if (generation.current === run) generation.current++;
    };
  }, [port]);
  const choose = (option: PresetOption) => {
    if (presets === undefined || busy) return;
    const run = generation.current;
    let seq = ++reads.current;
    const previous = presets;
    const optimistic = { ...presets, selected: option.value };
    setPresets(optimistic);
    setBusy(true);
    setError(undefined);
    port
      .choose(option.value)
      .then(async () => {
        if (generation.current !== run) return;
        setSwitched(true);
        const message = t.autoApprovalSwitched(
          presetMenu(optimistic, t.autoApprovalFollowGlobal).name,
        );
        if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
        else AccessibilityInfo.announceForAccessibility(message);
        seq = ++reads.current;
        const next = await port.load().catch(() => undefined);
        if (next !== undefined && generation.current === run && reads.current === seq)
          setPresets(next);
      })
      .catch((cause: unknown) => {
        if (generation.current !== run) return;
        if (reads.current === seq) setPresets(previous);
        setError(`${t.settingFailed} ${errorText(cause)}`);
      })
      .finally(() => {
        if (generation.current === run) setBusy(false);
      });
  };
  return (
    <View
      ref={mount}
      testID="approval-preset"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: space.x3,
        display: presets === undefined ? 'none' : 'flex',
      }}
    >
      {presets === undefined ? null : (
        <>
          {error === undefined ? null : (
            <Text variant="meta" tone="danger" style={{ flexShrink: 1 }}>
              {error}
            </Text>
          )}
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <ApprovalPresetPicker
              label={t.autoApprovalPresetTrigger(
                presetMenu(presets, t.autoApprovalFollowGlobal).name,
              )}
              header={t.autoApprovalPresetTitle}
              note={t.autoApprovalPresetNote}
              options={presetMenu(presets, t.autoApprovalFollowGlobal).options}
              {...(port.manage === undefined
                ? {}
                : { manageLabel: t.autoApprovalManage, onManage: port.manage })}
              disabled={busy}
              {...(width > 0 ? { maxWidth: width / 2 } : {})}
              {...(switched && error === undefined && Platform.OS !== 'android'
                ? { next: t.autoApprovalNext }
                : {})}
              onSelect={choose}
            />
          </View>
        </>
      )}
    </View>
  );
}
