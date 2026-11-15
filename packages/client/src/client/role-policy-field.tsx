import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import { TextAreaField, TextField } from './ds/field.js';
import { Select } from './ds/select.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { PolicyItem } from './team-roles-bridge.js';

const styles = stylex.create({
  list: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    padding: space.x3,
    borderRadius: radius.md,
    backgroundColor: color.well,
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
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  hint: { margin: 0, color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
});

export const POLICY_LIMIT = 100;

export function RolePolicyField({
  t,
  value,
  disabled,
  onChange,
}: {
  t: BotHarnessTranslate;
  value: readonly PolicyItem[];
  disabled: boolean;
  onChange(next: PolicyItem[]): void;
}): ReactElement {
  const update = (index: number, patch: Partial<PolicyItem>): void =>
    onChange(value.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  return (
    <div {...stylex.props(styles.list)} data-role-policy>
      <p {...stylex.props(styles.title)}>{t('team.policy.title')}</p>
      <p {...stylex.props(styles.hint)}>{t('team.policy.hint')}</p>
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
            <Select
              label={t('team.policy.effect')}
              value={item.effect}
              disabled={disabled}
              options={[
                { value: 'allow', label: t('team.policy.allow') },
                { value: 'deny', label: t('team.policy.deny') },
              ]}
              onChange={(effect) => update(index, { effect: effect as PolicyItem['effect'] })}
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
      {value.length >= POLICY_LIMIT ? null : (
        <div>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => onChange([...value, { topic: '', text: '', effect: 'deny' }])}
          >
            {t('team.policy.add')}
          </Button>
        </div>
      )}
    </div>
  );
}
