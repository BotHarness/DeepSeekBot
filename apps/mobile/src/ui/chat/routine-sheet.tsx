import { TextField } from '../primitives/text-field';
import { useRef, useState, type ComponentType, type ReactNode } from 'react';
import { View } from 'react-native';

import { KeyboardFormScroll } from '../primitives/keyboard-form';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { errorText, type Loadable } from '../../host/bot-settings';
import {
  newRoutineForm,
  routineFormOf,
  routineProblem,
  routineTriggerOf,
  WEEKDAYS,
  type RoutineCadence,
  type RoutineForm,
  type Routines,
} from '../../host/routines';
import type { BotScheduleFiring, BotScheduleSummary } from '../../host/wire';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { Chip } from '../primitives/chip';
import { ChevronRightIcon } from '../shell/icons';
import { t } from '../strings';
import type { RoutineTarget } from '../../host/routines';
import { firingText, routineDetail, when } from './routine-text';
import {
  Sheet,
  type SheetPageProps,
  SheetActions,
  SheetCallout,
  SheetFooter,
  SheetHeading,
  SheetNote,
  SHEET_GROUP,
} from './sheet';
import { LoadingIndicator } from '../primitives/loading-indicator';

const HISTORY = 5;
const PREVIEW = 5;
const PREVIEW_DELAY_MS = 300;
const CADENCES: RoutineCadence[] = ['daily', 'weekly', 'hours'];

type Mode = 'detail' | 'edit' | 'delete';

function Field({
  label,
  value,
  placeholder,
  multiline = false,
  keyboard = 'default',
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  keyboard?: 'default' | 'number-pad' | 'numbers-and-punctuation';
  onChange(text: string): void;
}) {
  return (
    <TextField
      accessibilityLabel={label}
      value={value}
      placeholder={placeholder}
      multiline={multiline}
      keyboardType={keyboard}
      autoCorrect={!multiline ? false : undefined}
      onChangeText={onChange}
      style={{ marginHorizontal: space.x5 }}
    />
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.x2,
        paddingHorizontal: space.x5,
      }}
    >
      {children}
    </View>
  );
}

function ListRows<T>({
  state,
  empty,
  render,
}: {
  state: Loadable<T[]>;
  empty: string;
  render(item: T): { key: string; title: string; detail?: string };
}) {
  if (state.status === 'loading')
    return (
      <SettingsGroupItem first last on={SHEET_GROUP}>
        <View style={{ padding: space.x4, alignItems: 'flex-start' }}>
          <LoadingIndicator />
        </View>
      </SettingsGroupItem>
    );
  if (state.status === 'failed') return <SheetNote tone="danger">{state.error}</SheetNote>;
  if (state.value.length === 0)
    return (
      <SettingsGroupItem first last on={SHEET_GROUP}>
        <SettingsRow title={empty} tone="muted" on={SHEET_GROUP} />
      </SettingsGroupItem>
    );
  return (
    <>
      {state.value.map((item, index) => {
        const row = render(item);
        return (
          <SettingsGroupItem
            key={row.key}
            first={index === 0}
            last={index === state.value.length - 1}
            on={SHEET_GROUP}
          >
            <SettingsRow
              title={row.title}
              {...(row.detail === undefined ? {} : { detail: row.detail })}
              on={SHEET_GROUP}
            />
          </SettingsGroupItem>
        );
      })}
    </>
  );
}

function useDebounced() {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return (work: () => void, delay: number) => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      work();
    }, delay);
  };
}

function RoutineEditor({
  form,
  preview,
  onChange,
}: {
  form: RoutineForm;
  preview: Loadable<string[]> | undefined;
  onChange(patch: Partial<RoutineForm>): void;
}) {
  const problem = routineProblem(form);
  return (
    <>
      <SheetHeading>{t.routineTitleLabel}</SheetHeading>
      <Field
        label={t.routineTitleLabel}
        value={form.title}
        placeholder={t.routineTitlePlaceholder}
        onChange={(title) => onChange({ title })}
      />
      <SheetHeading>{t.routineInstruction}</SheetHeading>
      <Field
        label={t.routineInstruction}
        value={form.prompt}
        placeholder={t.routineInstructionPlaceholder}
        multiline
        onChange={(prompt) => onChange({ prompt })}
      />
      <SheetHeading>{t.routineWhen}</SheetHeading>
      <ChipRow>
        {CADENCES.map((cadence) => (
          <Chip
            key={cadence}
            label={t.routineCadence[cadence]}
            selected={form.cadence === cadence}
            onPress={() => onChange({ cadence })}
          />
        ))}
      </ChipRow>
      {form.cadence === 'hours' ? (
        <>
          <SheetHeading>{t.routineHours}</SheetHeading>
          <Field
            label={t.routineHours}
            value={form.hours}
            keyboard="number-pad"
            onChange={(hours) => onChange({ hours })}
          />
        </>
      ) : (
        <>
          <SheetHeading>{t.routineTime}</SheetHeading>
          <Field
            label={t.routineTime}
            value={form.time}
            placeholder="09:00"
            keyboard="numbers-and-punctuation"
            onChange={(time) => onChange({ time })}
          />
        </>
      )}
      {form.cadence === 'weekly' ? (
        <>
          <SheetHeading>{t.routineDays}</SheetHeading>
          <ChipRow>
            {WEEKDAYS.map((day) => {
              const on = form.weekdays.includes(day);
              return (
                <Chip
                  key={day}
                  label={t.weekdayShort(day)}
                  selected={on}
                  onPress={() =>
                    onChange({
                      weekdays: on
                        ? form.weekdays.filter((value) => value !== day)
                        : [...form.weekdays, day].sort((a, b) => a - b),
                    })
                  }
                />
              );
            })}
          </ChipRow>
        </>
      ) : null}
      {form.cadence === 'hours' ? null : (
        <SheetFooter>{t.routineTimeZone(form.timeZone)}</SheetFooter>
      )}
      <SheetHeading>{t.routinePreview}</SheetHeading>
      {preview === undefined ? (
        <SheetNote>{t.routinePreviewIncomplete}</SheetNote>
      ) : preview.status === 'failed' ? (
        <SheetNote tone="warning">{t.routinePreviewRejected(preview.error)}</SheetNote>
      ) : (
        <ListRows
          state={
            preview.status === 'ready'
              ? { status: 'ready', value: preview.value.slice(0, PREVIEW) }
              : preview
          }
          empty={t.routinePreviewIncomplete}
          render={(at) => ({ key: at, title: when(at) })}
        />
      )}
      {problem === undefined ? null : <SheetNote>{t.routineProblem[problem]}</SheetNote>}
    </>
  );
}

export function RoutineSheet({
  page,
  initialMode,
  onEdit,
  botName,
  target,
  routines,
  onChanged,
  onClose,
  onOpenFullClient,
}: {
  page?: ComponentType<SheetPageProps> | undefined;
  initialMode?: 'detail' | 'edit';
  onEdit?: () => void;
  botName: string;
  target: RoutineTarget;
  routines: Routines;
  onChanged(): void;
  onClose(): void;
  onOpenFullClient(): void;
}) {
  const theme = useDesignTheme();
  const [routine, setRoutine] = useState<BotScheduleSummary | undefined>(
    target.kind === 'open' ? target.routine : undefined,
  );
  const [mode, setMode] = useState<Mode>(
    initialMode ?? (target.kind === 'new' ? 'edit' : 'detail'),
  );
  const [form, setForm] = useState<RoutineForm>(() =>
    target.kind === 'open' ? (routineFormOf(target.routine) ?? newRoutineForm()) : newRoutineForm(),
  );
  const [preview, setPreview] = useState<Loadable<string[]>>();
  const [history, setHistory] = useState<Loadable<BotScheduleFiring[]>>({ status: 'loading' });
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const debounce = useDebounced();
  const latest = useRef(form);

  const loadHistory = (id: string) =>
    void routines.history(id).then(
      (firings) =>
        setHistory({
          status: 'ready',
          value: [...firings].sort((a, b) => b.firedAt.localeCompare(a.firedAt)).slice(0, HISTORY),
        }),
      (cause: unknown) => setHistory({ status: 'failed', error: errorText(cause) }),
    );

  const refreshPreview = (next: RoutineForm, delay: number) => {
    const trigger = routineTriggerOf(next);
    if (trigger === undefined) {
      setPreview(undefined);
      return;
    }
    setPreview({ status: 'loading' });
    const key = JSON.stringify(trigger);
    debounce(() => {
      void routines.preview(trigger).then(
        (value) =>
          setPreview((current) =>
            JSON.stringify(routineTriggerOf(latest.current)) === key
              ? { status: 'ready', value }
              : current,
          ),
        (cause: unknown) =>
          setPreview((current) =>
            JSON.stringify(routineTriggerOf(latest.current)) === key
              ? { status: 'failed', error: errorText(cause) }
              : current,
          ),
      );
    }, delay);
  };

  const mount = useMounted<KeyboardAwareScrollViewRef>(() => {
    if (target.kind === 'open') loadHistory(target.routine.id);
    else refreshPreview(form, 0);
  }, []);

  const change = (patch: Partial<RoutineForm>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setForm(next);
    if ('title' in patch || 'prompt' in patch) return;
    refreshPreview(next, PREVIEW_DELAY_MS);
  };

  const run = (key: string, work: () => Promise<void>) => {
    if (busy !== undefined) return;
    setBusy(key);
    setError(undefined);
    setNotice(undefined);
    void work()
      .catch((cause: unknown) => setError(`${t.routineFailed} ${errorText(cause)}`))
      .finally(() => setBusy(undefined));
  };

  const close = () => {
    if (busy === undefined) onClose();
  };

  const status = (
    <>
      {notice === undefined ? null : <SheetNote>{notice}</SheetNote>}
      {error === undefined ? null : <SheetCallout tone="danger">{error}</SheetCallout>}
    </>
  );

  if (mode === 'edit') {
    const save = () =>
      run('save', async () => {
        const saved =
          routine === undefined
            ? await routines.create(latest.current)
            : await routines.update(routine.id, latest.current);
        setRoutine(saved);
        onChanged();
        if (routine === undefined) {
          onClose();
          return;
        }
        if (initialMode === 'edit') onClose();
        else setMode('detail');
      });
    const title = routine === undefined ? t.routineNew : t.routineEditTitle;
    return (
      <Sheet page={page} visible label={title} title={title} subtitle={botName} onClose={close}>
        <KeyboardFormScroll
          nestedScrollEnabled
          ref={mount}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingBottom: space.x3 }}
        >
          {status}
          <RoutineEditor form={form} preview={preview} onChange={change} />
          <SheetActions>
            <Button
              label={t.cancel}
              on="canvas"
              disabled={busy !== undefined}
              onPress={() => {
                if (routine === undefined) {
                  onClose();
                  return;
                }
                if (initialMode === 'edit') {
                  onClose();
                  return;
                }
                setError(undefined);
                setMode('detail');
              }}
            />
            <Button
              label={routine === undefined ? t.routineCreate : t.routineSave}
              tone="primary"
              on="canvas"
              busy={busy === 'save'}
              disabled={busy !== undefined || routineProblem(form) !== undefined}
              onPress={save}
            />
          </SheetActions>
        </KeyboardFormScroll>
      </Sheet>
    );
  }

  if (routine === undefined) return null;

  if (mode === 'delete')
    return (
      <Sheet
        page={page}
        visible
        label={t.routineDeleteConfirm(routine.title)}
        title={t.routineDeleteConfirm(routine.title)}
        onClose={close}
      >
        {status}
        <SheetFooter>{t.routineDeleteHint}</SheetFooter>
        <SheetActions>
          <Button
            label={t.cancel}
            on="canvas"
            disabled={busy !== undefined}
            onPress={() => setMode('detail')}
          />
          <Button
            label={t.routineDelete}
            tone="danger"
            on="canvas"
            busy={busy === 'delete'}
            disabled={busy !== undefined}
            onPress={() =>
              run('delete', async () => {
                await routines.remove(routine.id);
                onChanged();
                onClose();
              })
            }
          />
        </SheetActions>
      </Sheet>
    );

  const editable = routineFormOf(routine) !== undefined;
  const chevron = <ChevronRightIcon color={theme.color.muted} size={theme.type.title.line} />;
  return (
    <Sheet
      page={page}
      visible
      label={routine.title}
      title={routine.title}
      subtitle={routineDetail(routine)}
      onClose={close}
    >
      <KeyboardFormScroll
        nestedScrollEnabled
        ref={mount}
        contentContainerStyle={{ paddingBottom: space.x3 }}
      >
        {status}
        <View style={{ flexDirection: 'row', gap: space.x3, paddingHorizontal: space.x5 }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t.routineRunNow}
              tone="primary"
              on="canvas"
              busy={busy === 'run'}
              disabled={busy !== undefined}
              onPress={() =>
                run('run', async () => {
                  await routines.runNow(routine.id);
                  setNotice(t.routineStarted);
                  loadHistory(routine.id);
                  onChanged();
                })
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={routine.enabled ? t.routinePause : t.routineResume}
              on="canvas"
              busy={busy === 'enabled'}
              disabled={busy !== undefined}
              onPress={() =>
                run('enabled', async () => {
                  const next = await routines.setEnabled(routine.id, !routine.enabled);
                  setRoutine(next);
                  onChanged();
                })
              }
            />
          </View>
        </View>
        {routine.prompt === undefined || routine.prompt.trim() === '' ? null : (
          <>
            <SheetHeading>{t.routineInstruction}</SheetHeading>
            <SettingsGroupItem first last on={SHEET_GROUP}>
              <View style={{ paddingHorizontal: space.x5, paddingVertical: space.x4 }}>
                <Text selectable>{routine.prompt}</Text>
              </View>
            </SettingsGroupItem>
          </>
        )}
        <SheetHeading>{t.routineHistory}</SheetHeading>
        <ListRows
          state={history}
          empty={t.routineNoHistory}
          render={(firing) => ({
            key: firing.id,
            title: firingText(firing),
            detail: when(firing.firedAt),
          })}
        />
        <View style={{ height: space.x5 }} />
        <SettingsGroupItem first last={false} on={SHEET_GROUP}>
          <SettingsRow
            title={t.routineEdit}
            trailing={chevron}
            on={SHEET_GROUP}
            onPress={
              busy !== undefined
                ? undefined
                : editable
                  ? () => {
                      if (onEdit !== undefined) {
                        onEdit();
                        return;
                      }
                      const next = routineFormOf(routine)!;
                      latest.current = next;
                      setForm(next);
                      setError(undefined);
                      setNotice(undefined);
                      setMode('edit');
                      refreshPreview(next, 0);
                    }
                  : onOpenFullClient
            }
          />
        </SettingsGroupItem>
        <SettingsGroupItem first={false} last on={SHEET_GROUP}>
          <SettingsRow
            title={t.routineDelete}
            tone="danger"
            on={SHEET_GROUP}
            accessibilityLabel={t.routineDelete}
            onPress={() => {
              if (busy !== undefined) return;
              setError(undefined);
              setMode('delete');
            }}
          />
        </SettingsGroupItem>
        {editable ? null : <SheetFooter>{t.routineAdvanced}</SheetFooter>}
      </KeyboardFormScroll>
    </Sheet>
  );
}
