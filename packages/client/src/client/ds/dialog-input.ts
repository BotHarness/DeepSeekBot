const keyboardInput = new WeakSet<Document>();

export function trackDialogInput(document: Document): () => void {
  const onKey = () => keyboardInput.add(document);
  const onPointer = () => keyboardInput.delete(document);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onPointer, true);
  return () => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    keyboardInput.delete(document);
  };
}

export function dialogOpenedFromKeyboard(): boolean {
  return typeof document !== 'undefined' && keyboardInput.has(document);
}
