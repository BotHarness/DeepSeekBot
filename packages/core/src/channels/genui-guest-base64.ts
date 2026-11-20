const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

Object.defineProperty(globalThis, 'atob', {
  value: (input: string) => {
    const source = String(input)
      .replaceAll(/[\t\n\f\r ]/gu, '')
      .replace(/={1,2}$/u, '');
    if (source.length % 4 === 1 || /[^A-Za-z0-9+/]/u.test(source)) throw Error('Invalid base64.');
    let bits = 0;
    let buffer = 0;
    let output = '';
    for (const character of source) {
      buffer = (buffer << 6) | alphabet.indexOf(character);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((buffer >>> bits) & 255);
      }
    }
    return output;
  },
});
