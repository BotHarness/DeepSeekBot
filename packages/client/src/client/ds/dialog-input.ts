const keyboardInput = Symbol.for('@botharness/dialog-keyboard-input');
type DialogDocument = Document & { [keyboardInput]?: true };

export function trackDialogInput(document: DialogDocument): () => void {
  const onKey = () => {
    document[keyboardInput] = true;
  };
  const onPointer = () => {
    delete document[keyboardInput];
  };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onPointer, true);
  return () => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    onPointer();
  };
}

export function dialogOpenedFromKeyboard(): boolean {
  if (typeof document === 'undefined') return false;
  const owner: DialogDocument = document;
  return owner[keyboardInput] === true;
}
