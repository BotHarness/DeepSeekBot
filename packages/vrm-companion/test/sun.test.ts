import { describe, expect, it } from 'vitest';
import { clockLabel, solarDay, zonePlace } from '../src/client/sun.js';

describe('local sunrise and sunset', () => {
  it('follows the season for the time zone', () => {
    const summer = solarDay(new Date(2026, 5, 21, 12), 'Asia/Shanghai');
    const winter = solarDay(new Date(2026, 11, 21, 12), 'Asia/Shanghai');
    expect(summer.sunset - summer.sunrise).toBeGreaterThan(winter.sunset - winter.sunrise + 3);
    expect(summer.sunrise).toBeLessThan(winter.sunrise);
  });

  it('falls back to the zone offset and hemisphere', () => {
    expect(zonePlace('Etc/Unknown', -480)).toEqual([35, 120]);
    expect(zonePlace('Australia/Perth', -480)[0]).toBeLessThan(0);
  });

  it('formats clock hours', () => {
    expect(clockLabel(6.25)).toBe('6:15');
    expect(clockLabel(17.999)).toBe('18:00');
  });
});
