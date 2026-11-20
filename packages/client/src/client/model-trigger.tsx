import { useRef, useState, type ReactElement } from 'react';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { PickerTrigger } from './ds/picker-trigger.js';
import type { BotHarnessTranslate } from './locale.js';
import { TargetBrandIcon } from './model-brand.js';
import { ModelMenu, type ModelMenuEffort, type ModelMenuItem } from './model-menu.js';

export function ModelTrigger({
  label,
  items,
  value,
  placeholder,
  invalid = false,
  disabled = false,
  onSelect,
  efforts,
  effort,
  onEffort,
  t,
}: {
  label: string;
  items: readonly ModelMenuItem[];
  value: string;
  placeholder: string;
  invalid?: boolean;
  disabled?: boolean;
  onSelect(value: string): void;
  efforts?: readonly ModelMenuEffort[] | undefined;
  effort?: string | undefined;
  onEffort?: ((value: string) => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = items.find((item) => item.value === value);
  return (
    <>
      <PickerTrigger
        ref={trigger}
        label={current?.label ?? placeholder}
        placeholder={current === undefined}
        icon={
          current?.group !== undefined ? (
            <ChannelSidebarIcon name="git-branch" size={16} />
          ) : current?.model === undefined ? undefined : (
            <TargetBrandIcon
              brand={current.brand}
              external={current.engine !== undefined}
              size={16}
            />
          )
        }
        hint={current?.hint}
        hintIcon={
          current?.hintBrand === undefined ? undefined : (
            <TargetBrandIcon
              brand={current.hintBrand}
              external={current.hintExternal === true}
              size={12}
            />
          )
        }
        invalid={invalid}
        disabled={disabled}
        expanded={open}
        accessibleLabel={
          current === undefined
            ? label
            : [
                label,
                current.name,
                current.engine !== undefined || current.hintExternal
                  ? t('engine.externalLabel')
                  : undefined,
              ]
                .filter(Boolean)
                .join(' · ')
        }
        title={current?.name}
        onClick={() => setOpen((shown) => !shown)}
      />
      {open && !disabled ? (
        <ModelMenu
          label={label}
          items={items}
          value={value}
          onSelect={onSelect}
          efforts={efforts}
          effort={effort}
          onEffort={onEffort}
          anchorRef={trigger}
          onClose={() => setOpen(false)}
          t={t}
        />
      ) : null}
    </>
  );
}
