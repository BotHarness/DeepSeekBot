import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { errorMessage } from './bridge.js';
import { Field } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { color, text, space } from './ds/tokens.stylex.js';
import { SidebarCardRow } from './sidebar-card.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, StandingLimitsView } from './store.js';

export const DEFAULT_STANDING_LIMITS: StandingLimitsView = { soul: 5000, coreMemory: 3000 };
export const MIN_STANDING_LIMIT = 500;
export const MAX_STANDING_LIMIT = 50_000;
const CHARACTERS_PER_ENGLISH_WORD = 6;

const styles = stylex.create({
  label: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: space.x3,
  },
  file: {
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: 400,
  },
  control: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
  },
  input: { flexGrow: 1, minWidth: 0 },
  unit: {
    flexShrink: 0,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

const formatCount = (value: number): string => value.toLocaleString('en-US');

function parseLimit(text: string): number | undefined {
  if (!/^\d+$/u.test(text.trim())) return undefined;
  const value = Number(text.trim());
  return value >= MIN_STANDING_LIMIT && value <= MAX_STANDING_LIMIT ? value : undefined;
}

function LimitField({
  label,
  file,
  value,
  disabled,
  invalid,
  onChange,
  t,
}: {
  label: string;
  file: string;
  value: string;
  disabled: boolean;
  invalid: boolean;
  onChange: (value: string) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const parsed = parseLimit(value);
  return (
    <Field
      label={
        <span {...stylex.props(styles.label)}>
          <span>{label}</span>
          <code {...stylex.props(styles.file)}>{file}</code>
        </span>
      }
      hint={
        parsed === undefined
          ? t('standingLimits.range', {
              min: formatCount(MIN_STANDING_LIMIT),
              max: formatCount(MAX_STANDING_LIMIT),
            })
          : t('standingLimits.size', {
              chinese: formatCount(parsed),
              words: formatCount(Math.round(parsed / CHARACTERS_PER_ENGLISH_WORD / 10) * 10),
            })
      }
    >
      {(control) => (
        <span {...stylex.props(styles.control)}>
          <Input
            {...control}
            aria-invalid={invalid ? true : undefined}
            className={stylex.props(styles.input).className ?? ''}
            type="number"
            min={MIN_STANDING_LIMIT}
            max={MAX_STANDING_LIMIT}
            step={100}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
          <span {...stylex.props(styles.unit)}>{t('standingLimits.unit')}</span>
        </span>
      )}
    </Field>
  );
}

export function StandingLimitsRow({
  bot,
  actions,
  t,
}: {
  bot: BotSummary;
  actions: Pick<BridgeActions, 'setStandingLimits'>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [override, setOverride] = useState<{
    base: StandingLimitsView | undefined;
    value: StandingLimitsView;
  }>();
  const saved =
    override !== undefined && override.base === bot.standingLimits
      ? override.value
      : (bot.standingLimits ?? DEFAULT_STANDING_LIMITS);
  const [open, setOpen] = useState(false);
  const [soul, setSoul] = useState(String(saved.soul));
  const [coreMemory, setCoreMemory] = useState(String(saved.coreMemory));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const soulLimit = parseLimit(soul);
  const coreMemoryLimit = parseLimit(coreMemory);
  const valid = soulLimit !== undefined && coreMemoryLimit !== undefined;
  const changed = valid && (soulLimit !== saved.soul || coreMemoryLimit !== saved.coreMemory);
  const customized =
    saved.soul !== DEFAULT_STANDING_LIMITS.soul ||
    saved.coreMemory !== DEFAULT_STANDING_LIMITS.coreMemory;

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setError(undefined);
  };

  const start = (): void => {
    setSoul(String(saved.soul));
    setCoreMemory(String(saved.coreMemory));
    setError(undefined);
    setOpen(true);
  };

  const submit = async (): Promise<void> => {
    if (!valid || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const updated = await actions.setStandingLimits(bot.slug, {
        soul: soulLimit,
        coreMemory: coreMemoryLimit,
      });
      setOverride({
        base: bot.standingLimits,
        value: updated.standingLimits ?? { soul: soulLimit, coreMemory: coreMemoryLimit },
      });
      setOpen(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SidebarCardRow
        icon="ruler"
        title={t('standingLimits.title')}
        meta={t('standingLimits.summary', {
          soul: formatCount(saved.soul),
          coreMemory: formatCount(saved.coreMemory),
        })}
        chips={customized ? <Tag tone="info">{t('standingLimits.customized')}</Tag> : undefined}
        hint={t('standingLimits.edit')}
        dialog
        onClick={start}
      />
      {open ? (
        <FormDialog
          title={t('standingLimits.title')}
          description={t('standingLimits.description')}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          submitLabel={t(busy ? 'standingLimits.saving' : 'standingLimits.save')}
          submitDisabled={!changed}
          busy={busy}
          error={error}
          onCancel={() => {
            if (!busy) setOpen(false);
          }}
          onSubmit={() => void submit()}
          secondary={
            <Button
              type="button"
              variant="ghost"
              disabled={
                busy ||
                (soul === String(DEFAULT_STANDING_LIMITS.soul) &&
                  coreMemory === String(DEFAULT_STANDING_LIMITS.coreMemory))
              }
              onClick={() => {
                edit(setSoul)(String(DEFAULT_STANDING_LIMITS.soul));
                setCoreMemory(String(DEFAULT_STANDING_LIMITS.coreMemory));
              }}
            >
              {t('standingLimits.reset')}
            </Button>
          }
        >
          <LimitField
            label={t('standingLimits.soul')}
            file="SOUL.md"
            value={soul}
            disabled={busy}
            invalid={soulLimit === undefined}
            onChange={edit(setSoul)}
            t={t}
          />
          <LimitField
            label={t('standingLimits.coreMemory')}
            file="MEMORY.md"
            value={coreMemory}
            disabled={busy}
            invalid={coreMemoryLimit === undefined}
            onChange={edit(setCoreMemory)}
            t={t}
          />
        </FormDialog>
      ) : null}
    </>
  );
}
