import type { ReactElement } from 'react';

import { SelectionToolbar, SelectionToolbarButton } from './ds/selection-toolbar.js';
import { QuoteIcon } from './quote-icon.js';
import { dismissSelectionQuote, useSelectionQuote } from './selection-quote.js';

export function MessageSelectionToolbar({
  enabled,
  label,
  quoteLabel,
  canQuote,
  onQuote,
}: {
  readonly enabled: boolean;
  readonly label: string;
  readonly quoteLabel: string;
  readonly canQuote: (messageId: string) => boolean;
  readonly onQuote: (messageId: string, text: string) => void;
}): ReactElement | null {
  const selection = useSelectionQuote(enabled, canQuote);
  if (selection === undefined) return null;
  return (
    <SelectionToolbar x={selection.x} y={selection.y} below={selection.below} label={label}>
      <SelectionToolbarButton
        icon={<QuoteIcon />}
        onPress={() => {
          onQuote(selection.messageId, selection.text);
          dismissSelectionQuote();
        }}
      >
        {quoteLabel}
      </SelectionToolbarButton>
    </SelectionToolbar>
  );
}
