function crc(page: Uint8Array): number {
  let value = 0;
  for (const byte of page) {
    value ^= byte << 24;
    for (let bit = 0; bit < 8; bit++)
      value = value & 0x80000000 ? ((value << 1) ^ 0x04c11db7) >>> 0 : (value << 1) >>> 0;
  }
  return value >>> 0;
}

function page(packets: Uint8Array[], sequence: number, granule: number, serial = 7): Buffer {
  const lacing: number[] = [];
  for (const packet of packets) {
    for (let left = packet.length; ; left -= 255) {
      lacing.push(Math.min(left, 255));
      if (left < 255) break;
    }
  }
  const header = Buffer.alloc(27 + lacing.length);
  header.write('OggS', 0);
  header[5] = sequence === 0 ? 2 : 0;
  header.writeBigUInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = lacing.length;
  lacing.forEach((value, index) => (header[27 + index] = value));
  const result = Buffer.concat([header, ...packets]);
  result.writeUInt32LE(crc(result), 22);
  return result;
}

export function oggOpus(frames = 50, serial = 7): Buffer {
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0);
  head[8] = 1;
  head[9] = 1;
  head.writeUInt16LE(312, 10);
  head.writeUInt32LE(16000, 12);
  const tags = Buffer.alloc(16);
  tags.write('OpusTags', 0);
  const audio = Array.from({ length: frames }, () => Buffer.from([0xf8, 0xff, 0xfe]));
  return Buffer.concat([
    page([head], 0, 0, serial),
    page([tags], 1, 0, serial),
    page(audio, 2, frames * 960, serial),
  ]);
}
