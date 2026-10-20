import {
  createContext,
  type Context,
  useContext,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Tooltip as PrimitiveTooltip } from '@deepseek-ai/dsh-client-ui-primitives';

const shared = globalThis as typeof globalThis & Record<symbol, Context<boolean> | undefined>;
const InstantTooltips = (shared[Symbol.for('botharness.instant-tooltips')] ??=
  createContext(false));

export function InstantTooltipScope({ children }: { readonly children: ReactNode }): ReactElement {
  return <InstantTooltips.Provider value>{children}</InstantTooltips.Provider>;
}

export function Tooltip(props: ComponentProps<typeof PrimitiveTooltip>): ReactElement {
  const instant = useContext(InstantTooltips);
  return instant ? (
    <PrimitiveTooltip {...props} portal delayMs={0} focusDelayMs={0} />
  ) : (
    <PrimitiveTooltip {...props} />
  );
}
