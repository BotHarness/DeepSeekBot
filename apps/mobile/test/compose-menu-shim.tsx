import { createElement, type ReactNode } from 'react';

type Modifier = { onClick?: () => void; description?: string; id?: string; selected?: boolean };
const pass = ({ children }: { children?: ReactNode }) => children ?? null;

export const components = {
  Host: pass,
  Column: pass,
  RNHostView: pass,
  Row: ({ children, modifiers }: { children?: ReactNode; modifiers?: Modifier[] }) => {
    const onClick = modifiers?.find((modifier) => modifier.onClick)?.onClick;
    return createElement(
      onClick ? 'li' : 'div',
      {
        onClick,
        role: modifiers?.some((modifier) => modifier.selected !== undefined)
          ? 'radio'
          : onClick
            ? 'button'
            : undefined,
        'aria-checked': modifiers?.find((modifier) => modifier.selected !== undefined)?.selected,
        'data-menu-item': onClick ? '' : undefined,
        'data-testid': modifiers?.find((modifier) => modifier.id)?.id,
        'aria-label': modifiers?.find((modifier) => modifier.description)?.description,
      },
      children,
    );
  },
  Text: ({ children, color }: { children?: ReactNode; color?: string }) =>
    createElement('span', { 'data-color': color }, children),
  useMaterialColors: () => ({
    surfaceContainerLow: '#f7f2fa',
    onSurface: '#1d1b20',
    tertiaryContainer: '#ffd8e4',
    onTertiaryContainer: '#31111d',
  }),
};

export const modifiers = {
  Shapes: { RoundedCorner: () => ({}), Circle: {} },
  background: () => ({}),
  clickable: (onClick: () => void) => ({ onClick }),
  clip: () => ({}),
  defaultMinSize: () => ({}),
  fillMaxSize: () => ({}),
  fillMaxWidth: () => ({}),
  graphicsLayer: () => ({}),
  padding: () => ({}),
  paddingAll: () => ({}),
  semantics: ({ contentDescription }: { contentDescription: string }) => ({
    description: contentDescription,
  }),
  weight: () => ({}),
  width: () => ({}),
  testID: (id: string) => ({ id }),
  selectable: (selected: boolean, onClick: () => void) => ({ selected, onClick }),
};
