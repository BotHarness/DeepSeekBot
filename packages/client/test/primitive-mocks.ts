import {
  act,
  createElement,
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
} from 'react';

export function comboboxPrimitives() {
  return {
    Input: (props: InputHTMLAttributes<HTMLInputElement>) =>
      createElement('span', null, createElement('input', props)),
    IconChevronDownOutlineRegular: () => null,
    IconPlusOutlineRegular: () => null,
    IconRefreshOutlineRegular: () => null,
    IconRightUpOutlineRegular: () => null,
    MenuSurface: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { compact?: boolean }>(
      ({ compact: _compact, ...props }, ref) => createElement('div', { ...props, ref }),
    ),
    useAnchoredPosition: () => ({ top: 0, left: 0 }),
    useDismissOnOutsidePointer: () => undefined,
  };
}

export function combobox(label: string, root: ParentNode = document): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>(
    `input[role="combobox"][aria-label="${label}"]`,
  );
  if (input === null) throw new Error(`No combobox labelled ${label}`);
  return input;
}

export function comboboxOption(value: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (option) => option.dataset.value === value,
  );
}

export async function openCombobox(label: string, root: ParentNode = document): Promise<void> {
  const input = combobox(label, root);
  await act(async () => input.click());
}

export async function chooseOption(
  label: string,
  value: string,
  root: ParentNode = document,
): Promise<void> {
  await openCombobox(label, root);
  const option = comboboxOption(value);
  if (option === undefined) throw new Error(`No option ${value} in ${label}`);
  await act(async () => option.click());
}

export function dialogPrimitives() {
  return {
    Button: forwardRef<
      HTMLButtonElement,
      HTMLAttributes<HTMLButtonElement> & {
        variant?: string;
        size?: string;
        icon?: unknown;
        type?: 'button' | 'submit';
        form?: string;
        disabled?: boolean;
      }
    >(({ variant, size: _size, icon: _icon, ...props }, ref) =>
      createElement('button', { ...props, ref, 'data-variant': variant }),
    ),
    Input: forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
      ({ className, ...props }, ref) =>
        createElement('span', { className }, createElement('input', { ...props, ref })),
    ),
    Modal: ({
      open,
      title,
      description,
      closeLabel,
      onClose,
      children,
      footer,
      className,
    }: {
      open: boolean;
      title: string;
      description?: string;
      closeLabel?: string;
      onClose(): void;
      children?: unknown;
      footer?: unknown;
      className?: string;
    }) =>
      open
        ? createElement(
            'div',
            { role: 'dialog', 'aria-label': title, className },
            createElement('h2', null, title),
            description === undefined ? null : createElement('p', null, description),
            createElement('button', { type: 'button', 'aria-label': closeLabel, onClick: onClose }),
            children as never,
            footer as never,
          )
        : null,
  };
}

export function dialog(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[role="dialog"]');
  if (found === null) throw new Error('No dialog');
  return found;
}

export function buttonNamed(name: string, root: ParentNode = document): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === name,
  );
  if (found === undefined) throw new Error(`No button named ${name}`);
  return found;
}

export function fieldNamed(name: string, root: ParentNode = document): HTMLInputElement {
  const label = [...root.querySelectorAll<HTMLLabelElement>('label')].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  const input = label === undefined ? null : document.getElementById(label.htmlFor);
  if (!(input instanceof HTMLInputElement)) throw new Error(`No field named ${name}`);
  return input;
}

export async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
