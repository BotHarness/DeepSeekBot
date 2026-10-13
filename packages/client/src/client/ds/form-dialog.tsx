import { useId, type FormEvent, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import { Modal } from '../modal.js';
import { color, dialog, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  small: { width: dialog.small, maxWidth: '100%' },
  standard: { width: dialog.standard, maxWidth: '100%' },
  wide: { width: dialog.wide, maxWidth: '100%' },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
    margin: 0,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  error: {
    margin: 0,
    color: color.danger,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.x3,
    width: '100%',
  },
  spacer: { flexGrow: 1 },
  scroll: { maxHeight: dialog.bodyMax, overflowY: 'auto', overscrollBehavior: 'contain' },
  danger: {
    backgroundColor: { default: color.danger, ':hover': color.danger },
    borderColor: 'transparent',
    color: { default: color.onDanger, ':hover': color.onDanger },
    opacity: { default: 1, ':hover': 0.88, ':disabled': 0.5 },
  },
  dangerQuiet: {
    color: { default: color.danger, ':disabled': color.muted },
  },
});

export type DialogSize = 'small' | 'standard' | 'wide';

export interface DialogLabels {
  readonly close: string;
  readonly cancel: string;
}

export function FormDialog({
  title,
  description,
  size = 'small',
  labels,
  submitLabel,
  onCancel,
  onSubmit,
  submitDisabled = false,
  busy = false,
  danger = false,
  error,
  secondary,
  onClose,
  showCancel = true,
  scroll = false,
  submitData,
  children,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly size?: DialogSize;
  readonly labels: DialogLabels;
  readonly submitLabel: string;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
  readonly submitDisabled?: boolean;
  readonly busy?: boolean;
  readonly danger?: boolean;
  readonly error?: ReactNode;
  readonly secondary?: ReactNode;
  readonly onClose?: () => void;
  readonly showCancel?: boolean;
  readonly scroll?: boolean;
  readonly submitData?: Readonly<Record<`data-${string}`, string>>;
  readonly children?: ReactNode;
}): ReactElement {
  const formId = useId();
  const blocked = submitDisabled || busy;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!blocked) onSubmit();
  };
  return (
    <Modal
      open
      onClose={onClose ?? onCancel}
      closeLabel={labels.close}
      title={title}
      {...(description === undefined ? {} : { description })}
      className={stylex.props(styles[size]).className ?? ''}
      footer={
        <div {...stylex.props(styles.footer)}>
          {secondary === undefined ? null : (
            <>
              {secondary}
              <span {...stylex.props(styles.spacer)} />
            </>
          )}
          {showCancel ? (
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              {labels.cancel}
            </Button>
          ) : null}
          <Button
            {...submitData}
            type="submit"
            form={formId}
            variant="primary"
            disabled={blocked}
            aria-busy={busy || undefined}
            className={danger ? (stylex.props(styles.danger).className ?? '') : undefined}
          >
            {submitLabel}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={submit}
        {...stylex.props(styles.form, scroll && styles.scroll)}
      >
        {children}
        {error === undefined || error === null || error === false ? null : (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function ConfirmDialog({
  title,
  description,
  labels,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
  danger = true,
  error,
  children,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly labels: DialogLabels;
  readonly confirmLabel: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly busy?: boolean;
  readonly danger?: boolean;
  readonly error?: ReactNode;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <FormDialog
      title={title}
      description={description}
      labels={labels}
      submitLabel={confirmLabel}
      onCancel={onCancel}
      onSubmit={onConfirm}
      busy={busy}
      danger={danger}
      error={error}
    >
      {children}
    </FormDialog>
  );
}

export function DangerTextButton({
  children,
  onClick,
  disabled,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}): ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className={stylex.props(styles.dangerQuiet).className ?? ''}
    >
      {children}
    </Button>
  );
}
