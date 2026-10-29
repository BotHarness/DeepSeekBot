import { useContext, useState, type ReactNode } from 'react';
import { AppearanceContext } from './appearance-context.js';
import { PanelAppearanceSettings } from './appearance-panel-settings.js';
import { panelTargetId } from './appearance-panels.js';
import { usePanelMenu } from './panel-menu.js';
import type { BotHarnessTranslate } from './locale.js';

export function AppearancePanelHeader({
  id,
  label,
  t,
  className,
  children,
}: {
  id: string;
  label: string;
  t: BotHarnessTranslate;
  className?: string;
  children: ReactNode;
}) {
  const owner = useContext(AppearanceContext);
  const [open, setOpen] = useState(false);
  const menu = usePanelMenu({
    items: owner ? [{ id: 'appearance', label: t('appearance.panelMenu') }] : [],
    onSelect: () => setOpen(true),
  });
  return (
    <>
      {open && owner && (
        <PanelAppearanceSettings
          owner={owner}
          id={panelTargetId(id)}
          label={label}
          t={t}
          onClose={() => setOpen(false)}
        />
      )}
      <div className={className} data-appearance-header={id} {...(owner ? menu.triggerProps : {})}>
        {menu.menu}
        {children}
      </div>
    </>
  );
}
