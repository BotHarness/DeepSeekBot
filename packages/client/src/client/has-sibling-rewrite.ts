function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function compound(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (depth === 0 && /[\s>+~,]/.test(char)) return false;
  }
  return depth === 0 && text.length > 0;
}

export function siblingSelector(selector: string): string | undefined {
  const trimmed = selector.trim();
  if (!trimmed.startsWith(':has(')) return undefined;
  const end = closingParen(trimmed, ':has'.length);
  if (end < 0) return undefined;
  const inner = trimmed.slice(':has('.length, end).trim();
  const rest = trimmed.slice(end + 1).trim();
  if (!inner.startsWith('>') || !rest.startsWith('>')) return undefined;
  const child = inner.slice(1).trim();
  const subject = rest.slice(1).trim();
  if (!compound(child) || !compound(subject)) return undefined;
  return `${child} ~ ${subject}, ${subject}:has(~ ${child})`;
}

function rewriteRules(sheet: CSSStyleSheet | CSSGroupingRule): void {
  const rules = sheet.cssRules;
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index]!;
    if ('selectorText' in rule) {
      const style = rule as CSSStyleRule;
      const next = siblingSelector(style.selectorText);
      if (next !== undefined) style.selectorText = next;
    } else if ('cssRules' in rule) {
      rewriteRules(rule as CSSGroupingRule);
    }
  }
}

export function rewriteHasSiblingRules(doc: Document): () => void {
  if (doc.styleSheets === undefined || typeof MutationObserver === 'undefined') return () => {};
  const seen = new WeakSet<CSSStyleSheet>();
  const sweep = (): void => {
    for (const sheet of Array.from(doc.styleSheets)) {
      if (seen.has(sheet)) continue;
      seen.add(sheet);
      const owner = sheet.ownerNode as Partial<Element> | null;
      if (owner?.hasAttribute?.('data-botharness') === true) continue;
      try {
        rewriteRules(sheet);
      } catch {}
    }
  };
  sweep();
  const observer = new MutationObserver(sweep);
  observer.observe(doc.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => observer.disconnect();
}
