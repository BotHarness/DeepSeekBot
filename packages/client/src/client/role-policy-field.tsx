import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Button } from './ds/button.js';
import { TextAreaField, TextField } from './ds/field.js';
import { Select } from './ds/select.js';
import { ink, layer, space, style, type } from './ds/tobs.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';

export type PolicyEffect = 'allow' | 'ask' | 'deny';

export interface PolicyRow<Effect extends PolicyEffect> {
  readonly topic: string;
  readonly text: string;
  readonly effect: Effect;
}

const EFFECT_LABEL = {
  allow: 'team.policy.allow',
  ask: 'team.policy.ask',
  deny: 'team.policy.deny',
} as const satisfies Record<PolicyEffect, BotHarnessKey>;

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    minWidth: 0,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    padding: space.x3,
    borderRadius: style.radiusCard,
    backgroundColor: layer.well,
    minWidth: 0,
  },
  head: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: space.x2,
    alignItems: 'end',
  },
  title: {
    margin: 0,
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    fontWeight: type.labelWeight,
  },
  hint: {
    margin: 0,
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
  },
});

export const POLICY_LIMIT = 100;

export function RolePolicyField<Effect extends PolicyEffect>({
  t,
  value,
  effects,
  title,
  hint,
  effectLabels = EFFECT_LABEL,
  disabled,
  onChange,
}: {
  t: BotHarnessTranslate;
  value: readonly PolicyRow<Effect>[];
  effects: readonly Effect[];
  title?: string | undefined;
  hint?: string | undefined;
  effectLabels?: Readonly<Record<PolicyEffect, BotHarnessKey>>;
  disabled: boolean;
  onChange(next: PolicyRow<Effect>[]): void;
}): ReactElement {
  const fallback = effects.includes('deny' as Effect) ? ('deny' as Effect) : effects[0];
  const update = (index: number, patch: Partial<PolicyRow<Effect>>): void =>
    onChange(value.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  return (
    <div {...stylex.props(styles.list)} data-role-policy>
      <p {...stylex.props(styles.title)}>{title ?? t('team.policy.title')}</p>
      <p {...stylex.props(styles.hint)}>{hint ?? t('team.policy.hint')}</p>
      {value.map((item, index) => (
        <div key={index} {...stylex.props(styles.item)} data-role-policy-item={index}>
          <div {...stylex.props(styles.head)}>
            <TextField
              label={t('team.policy.topic')}
              value={item.topic}
              onChange={(topic) => update(index, { topic })}
              maxLength={80}
              disabled={disabled}
            />
            <Select<Effect>
              label={t('team.policy.effect')}
              value={item.effect}
              disabled={disabled}
              options={effects.map((effect) => ({ value: effect, label: t(effectLabels[effect]) }))}
              onChange={(effect) => update(index, { effect })}
            />
          </div>
          <TextAreaField
            label={t('team.policy.text')}
            value={item.text}
            onChange={(next) => update(index, { text: next })}
            maxLength={1000}
            rows={3}
            disabled={disabled}
          />
          <div>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => onChange(value.filter((_, at) => at !== index))}
            >
              {t('team.policy.remove')}
            </Button>
          </div>
        </div>
      ))}
      {value.length >= POLICY_LIMIT || fallback === undefined ? null : (
        <div>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => onChange([...value, { topic: '', text: '', effect: fallback }])}
          >
            {t('team.policy.add')}
          </Button>
        </div>
      )}
    </div>
  );
}
