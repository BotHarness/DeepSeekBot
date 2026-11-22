export const SNAPSHOT_SCRIPT = `(() => {
  for (const el of document.querySelectorAll('[data-botharness-ref]')) {
    el.removeAttribute('data-botharness-ref');
  }
  const observationId = Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(36).padStart(7, '0')).join('');
  const elements = [];
  const cap = 250;
  const nameOf = (el) => {
    const safeValue = el instanceof HTMLInputElement && ['password', 'file', 'hidden'].includes(el.type) ? '' : el.value;
    const raw = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('name') || (el.innerText || el.textContent || safeValue || '');
    return String(raw).trim().replace(/\\s+/g, ' ').slice(0, 80);
  };
  const add = (el, role, fallbackName) => {
    if (elements.length >= cap) return false;
    const ref = 'e' + observationId + '_' + (elements.length + 1);
    el.setAttribute('data-botharness-ref', ref);
    const state = {};
    const input = el instanceof HTMLInputElement;
    const textValue = (input && !['password', 'file', 'hidden', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image'].includes(el.type)) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable;
    if (textValue) {
      const value = String(el.isContentEditable ? el.innerText : el.value);
      state.value = value.slice(0, 256);
      if (value.length > 256) state.valueTruncated = true;
    }
    const checked = el.getAttribute('aria-checked');
    if (checked === 'mixed') state.checked = 'mixed';
    else if (checked === 'true' || checked === 'false') state.checked = checked === 'true';
    else if (input && ['checkbox', 'radio'].includes(el.type)) state.checked = el.indeterminate ? 'mixed' : el.checked;
    if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') state.disabled = true;
    if (el.readOnly || el.getAttribute('aria-readonly') === 'true') state.readOnly = true;
    const expanded = el.getAttribute('aria-expanded');
    if (expanded === 'true' || expanded === 'false') state.expanded = expanded === 'true';
    const selected = el.getAttribute('aria-selected');
    if (selected === 'true' || selected === 'false') state.selected = selected === 'true';
    elements.push({ ref: ref, role: role, name: nameOf(el) || fallbackName || '', ...state });
    return true;
  };
  const wanted = 'a[href],button,input,textarea,select,summary,[role],[contenteditable="true"],[tabindex]';
  for (const el of document.querySelectorAll(wanted)) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (!add(el, el.getAttribute('role') || el.tagName.toLowerCase())) break;
  }
  const clickables = [];
  for (const el of document.querySelectorAll('div,span,li,i,svg,img,label,section')) {
    if (clickables.length >= 400 || elements.length >= cap) break;
    if (el.hasAttribute('data-botharness-ref')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    if (getComputedStyle(el).cursor !== 'pointer') continue;
    if (el.closest('a[href],button,input,textarea,select,summary,[role]')) continue;
    clickables.push(el);
  }
  for (const el of clickables) {
    if (elements.length >= cap) break;
    if (clickables.some((other) => other !== el && el.contains(other))) continue;
    const rect = el.getBoundingClientRect();
    const center = '@' + Math.round(rect.left + rect.width / 2) + ',' + Math.round(rect.top + rect.height / 2);
    add(el, 'clickable', el.tagName.toLowerCase() + ' ' + center);
  }
  const text = String((document.body && (document.body.innerText || document.body.textContent)) || '').replace(/\\s+/g, ' ').trim().slice(0, 6000);
  return { url: location.href, title: document.title, elements: elements, text: text };
})()`;

export const selectorExpression = (ref: string): string =>
  `document.querySelector(${JSON.stringify(`[data-botharness-ref=${JSON.stringify(ref)}]`)})`;

export const clickScript = (ref: string): string =>
  `(() => { const el = ${selectorExpression(ref)}; if (!el) return { ok: false, reason: 'stale-ref' }; el.scrollIntoView({ block: 'center', inline: 'center' }); const rect = el.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return { ok: false, reason: 'not-clickable' }; return { ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`;

export const typeScript = (ref: string, text: string): string =>
  `(() => { const el = ${selectorExpression(ref)}; if (!el) return { ok: false, reason: 'stale-ref' }; if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { if (el.matches(':disabled')) return { ok: false, reason: 'disabled' }; if (el.readOnly) return { ok: false, reason: 'readonly' }; } el.focus(); if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const descriptor = Object.getOwnPropertyDescriptor(proto, 'value'); const setter = descriptor && descriptor.set; if (setter) { setter.call(el, ${JSON.stringify(text)}); } else { el.value = ${JSON.stringify(text)}; } el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; } if (el.isContentEditable) { el.textContent = ${JSON.stringify(text)}; el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(text)} })); return { ok: true }; } return { ok: false, reason: 'not-editable' }; })()`;
