export function qqOrdinaryMediaSource(source) {
  const replacements = [
    [
      'const sourceImages = addressed && this.#sourceImages() === true;',
      'const sourceImages = (addressed || ordinary) && this.#sourceImages() === true;',
    ],
    [
      'const sourceFiles = addressed && this.#sourceFiles() === true;',
      'const sourceFiles = (addressed || ordinary) && this.#sourceFiles() === true;',
    ],
    [
      'const mediaEnabled = addressed && message?.attachments?.length;',
      'const mediaEnabled = (addressed || ordinary) && message?.attachments?.length;',
    ],
  ];
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2)
      throw new Error('QQ ordinary-media Provider source seam changed');
    source = source.replace(before, after);
  }
  return source;
}
