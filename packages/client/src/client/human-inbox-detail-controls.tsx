import {
  Button,
  IconCloseOutlineRegular,
  IconChevronDownOutlineRegular,
  IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';
import { useRef, useState, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type { HumanAttentionItem } from './store.js';
import type { BotHarnessTranslate } from './locale.js';

export function HumanInboxDismiss({
  source,
  actions,
  t,
  onClose,
  disabled = false,
}: {
  source: HumanAttentionItem;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose: () => void;
  disabled?: boolean;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const dismiss = async (): Promise<void> => {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await actions.dismissHumanInbox(source);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="bh-human-inbox-dismiss">
      <Button
        size="sm"
        variant="outline"
        type="button"
        disabled={disabled || busy}
        onClick={() => void dismiss()}
      >
        <IconCloseOutlineRegular size={14} />
        {t('humanInbox.dismiss')}
      </Button>
      {failed ? <span role="alert">{t('humanInbox.failed')}</span> : null}
    </div>
  );
}

export function HumanInboxContextEdge({
  direction,
  disabled,
  busy,
  onClick,
  t,
}: {
  direction: 'older' | 'newer';
  disabled: boolean;
  busy?: boolean;
  onClick: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const label = t(direction === 'older' ? 'humanInbox.context.older' : 'humanInbox.context.newer');
  return (
    <Tooltip label={label} portal side={direction === 'older' ? 'top' : 'bottom'}>
      <button
        type="button"
        className={'bh-human-inbox-context-edge bh-human-inbox-context-' + direction}
        aria-label={label}
        aria-busy={busy || undefined}
        disabled={disabled || busy}
        onClick={onClick}
      >
        <IconChevronDownOutlineRegular />
      </button>
    </Tooltip>
  );
}

export function HumanInboxMessageSource({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}): ReactElement {
  return (
    <Tooltip label={label} portal side="top">
      <button
        type="button"
        className="bh-human-inbox-message-source"
        aria-label={label}
        onClick={onClick}
      >
        <IconRightUpOutlineRegular />
      </button>
    </Tooltip>
  );
}
