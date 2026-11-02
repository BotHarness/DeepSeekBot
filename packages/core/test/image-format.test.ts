import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectImage, ImageFormatError, MAX_SVG_BYTES } from '../src/media/image-format.js';

const bytes = (name: string) =>
  readFileSync(new URL(`./fixtures/memory-images/${name}`, import.meta.url));
const svg = (body: string, attrs = 'width="160" height="90"') =>
  new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`);
const status = (value: Uint8Array) => {
  try {
    return inspectImage(value);
  } catch (error) {
    expect(error).toBeInstanceOf(ImageFormatError);
    return (error as ImageFormatError).status;
  }
};

describe('shared Memory image format boundary', () => {
  it.each([
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['gif', 'image/gif'],
    ['webp', 'image/webp'],
    ['svg', 'image/svg+xml'],
  ])('reads genuine %s bytes without relying on a filename', (extension, mime) => {
    for (const name of ['blue', 'orange', 'green'])
      expect(inspectImage(bytes(`${name}.${extension}`))).toMatchObject({
        width: 160,
        height: 90,
        mime,
      });
  });
  it.each(['gif', 'webp'])(
    'accepts genuine animated %s within bounded frame/pixel limits',
    (extension) => {
      expect(inspectImage(bytes(`animated.${extension}`))).toMatchObject({
        width: 160,
        height: 90,
        mime: `image/${extension}`,
      });
    },
  );
  it('accepts static CSS, gradients, units, viewBox and bounded internal use', () => {
    expect(
      inspectImage(
        svg(
          '<defs><path id="arrow" d="M0 0L10 10"/></defs><use href="#arrow"/>',
          'viewBox="0 0 200 100" width="2in"',
        ),
      ),
    ).toMatchObject({ width: 192, height: 96 });
    expect(
      inspectImage(
        svg(
          '<style>.a { fill: url(#gradient); font-family: sans-serif; }</style><defs><linearGradient id="gradient"><stop offset="1" stop-color="blue"/></linearGradient></defs><rect class="a" width="80" height="80"/>',
        ),
      ),
    ).toMatchObject({ mime: 'image/svg+xml' });
  });
  it.each([
    '<script>alert(1)</script>',
    '<style>@import \"https://outside.invalid/a\";<style>.a{fill:blue}</style></style>',
    '<rect onload="alert(1)"/>',
    '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>',
    '<image href="https://outside.invalid/pic.png"/>',
    '<use href="file:///etc/passwd"/>',
    '<use href="https://outside.invalid/a.svg#x"/>',
    '<style>@import "https://outside.invalid/x.css";</style>',
    '<style>.a{fill:url(https://outside.invalid/x.svg#g)}</style>',
    '<rect style="fill:u\\72l(https://outside.invalid/x.svg)"/>',
    '<rect style="background:image-set(\'https://outside.invalid/a.png\')"/>',
    '<rect fill="url(&#104;ttps://outside.invalid/x)"/>',
    '<animate attributeName="href" to="https://outside.invalid/a"/>',
    '<filter id="x"><feGaussianBlur stdDeviation="9999"/></filter>',
    '<g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g>',
    '<rect style="fill:url(#missing)"/>',
  ])('refuses active, external, malformed or cyclic SVG %s', (body) => {
    expect(status(svg(body))).toBe('unsupported');
  });
  it('rejects XML base, doctypes, stylesheet instructions and namespace tricks', () => {
    expect(status(svg('<use href="#a"/>', 'xml:base="https://outside.invalid/"'))).toBe(
      'unsupported',
    );
    expect(
      status(
        new TextEncoder().encode(
          '<!DOCTYPE svg SYSTEM "file:///etc/passwd">' + new TextDecoder().decode(svg('')),
        ),
      ),
    ).toBe('unsupported');
    expect(
      status(
        new TextEncoder().encode(
          '<?xml-stylesheet href="https://outside.invalid/a.xsl"?>' +
            new TextDecoder().decode(svg('')),
        ),
      ),
    ).toBe('unsupported');
    expect(
      status(
        new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg"><x:script xmlns:x="http://www.w3.org/1999/xhtml"/></svg>',
        ),
      ),
    ).toBe('unsupported');
  });
  it('bounds SVG bytes, tree depth, expansion and decode dimensions', () => {
    expect(status(svg(' '.repeat(MAX_SVG_BYTES)))).toBe('too-large');
    expect(status(svg('<g>'.repeat(65) + '</g>'.repeat(65)))).toBe('too-large');
    const chain = Array.from(
      { length: 16 },
      (_, index) =>
        `<g id="n${index}">${index ? `<use href="#n${index - 1}"/><use href="#n${index - 1}"/>` : '<rect width="1" height="1"/>'}</g>`,
    ).join('');
    expect(status(svg('<defs>' + chain + '</defs><use href="#n15"/>'))).toBe('too-large');
    expect(status(svg('', 'width="16385" height="1"'))).toBe('too-large');
    expect(status(svg('', 'width="8000" height="8000"'))).toBe('too-large');
  });
  it('refuses JPEG marker overflow and empty or incomplete scan headers', () => {
    expect(status(Uint8Array.of(255, 216, 255, 255, 255, 217))).toBe('unsupported');
    const jpeg = bytes('blue.jpg');
    const scan = jpeg.indexOf(Buffer.from([255, 218]));
    expect(scan).toBeGreaterThan(0);
    const length = jpeg.readUInt16BE(scan + 2);
    expect(
      status(Buffer.concat([jpeg.subarray(0, scan + 2 + length), Buffer.from([255, 217])])),
    ).toBe('unsupported');
    const invalid = Buffer.from(jpeg);
    invalid.writeUInt16BE(2, scan + 2);
    expect(status(invalid)).toBe('unsupported');
  });
  it('bounds CSS fragment expansion across all possible matching elements', () => {
    const pattern =
      '<defs><pattern id="p">' + '<rect width="1" height="1"/>'.repeat(150) + '</pattern></defs>';
    expect(
      status(
        svg(
          '<style>.paint{fill:url(#p)}</style>' +
            pattern +
            '<rect class="paint" width="1" height="1"/>'.repeat(150),
        ),
      ),
    ).toBe('too-large');
  });
  it('refuses truncated raster containers and catches forged dimensions', () => {
    for (const extension of ['png', 'jpg', 'gif', 'webp'])
      expect(status(bytes(`blue.${extension}`).subarray(0, 18))).toBe('unsupported');
    const png = bytes('blue.png');
    png.writeUInt32BE(16385, 16);
    expect(status(png)).toBe('too-large');
    const gif = bytes('blue.gif');
    gif.writeUInt16LE(65535, 6);
    expect(status(gif)).toBe('too-large');
    const webp = bytes('blue.webp');
    webp.writeUInt32LE(1, 4);
    expect(status(webp)).toBe('unsupported');
  });
});
