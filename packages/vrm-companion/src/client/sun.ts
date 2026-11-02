const PLACES: Record<string, [number, number]> = {
  'Asia/Shanghai': [31.2, 121.5],
  'Asia/Chongqing': [29.6, 106.5],
  'Asia/Urumqi': [43.8, 87.6],
  'Asia/Hong_Kong': [22.3, 114.2],
  'Asia/Macau': [22.2, 113.5],
  'Asia/Taipei': [25, 121.5],
  'Asia/Tokyo': [35.7, 139.7],
  'Asia/Seoul': [37.6, 127],
  'Asia/Singapore': [1.35, 103.8],
  'Asia/Bangkok': [13.8, 100.5],
  'Asia/Kolkata': [22.6, 77.2],
  'Asia/Dubai': [25.2, 55.3],
  'Europe/London': [51.5, -0.1],
  'Europe/Paris': [48.9, 2.35],
  'Europe/Berlin': [52.5, 13.4],
  'Europe/Moscow': [55.8, 37.6],
  'America/New_York': [40.7, -74],
  'America/Chicago': [41.9, -87.6],
  'America/Denver': [39.7, -105],
  'America/Los_Angeles': [34.1, -118.2],
  'America/Toronto': [43.7, -79.4],
  'America/Vancouver': [49.3, -123.1],
  'America/Sao_Paulo': [-23.6, -46.6],
  'Australia/Sydney': [-33.9, 151.2],
  'Australia/Melbourne': [-37.8, 145],
  'Pacific/Auckland': [-36.8, 174.8],
};
const SOUTH =
  /^(Australia|Pacific\/Auckland|America\/(Sao_Paulo|Argentina|Santiago|Montevideo)|Africa\/Johannesburg)/;

export interface SolarDay {
  sunrise: number;
  sunset: number;
}

export const zonePlace = (zone: string, offsetMinutes: number): [number, number] =>
  PLACES[zone] ?? [SOUTH.test(zone) ? -30 : 35, -offsetMinutes / 4];

export const solarDay = (
  date: Date,
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): SolarDay => {
  const offset = date.getTimezoneOffset();
  const [latitude, longitude] = zonePlace(zone, offset);
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const year = (2 * Math.PI * (day - 1)) / 365;
  const declination =
    0.006918 -
    0.399912 * Math.cos(year) +
    0.070257 * Math.sin(year) -
    0.006758 * Math.cos(2 * year) +
    0.000907 * Math.sin(2 * year);
  const equation =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(year) -
      0.032077 * Math.sin(year) -
      0.014615 * Math.cos(2 * year) -
      0.040849 * Math.sin(2 * year));
  const phi = (latitude * Math.PI) / 180;
  const zenith = (90.833 * Math.PI) / 180;
  const cosine =
    Math.cos(zenith) / (Math.cos(phi) * Math.cos(declination)) -
    Math.tan(phi) * Math.tan(declination);
  const spread = (Math.acos(Math.max(-0.95, Math.min(0.95, cosine))) * 180) / Math.PI / 15;
  const noon = 12 - (longitude * 4 + offset + equation) / 60;
  return { sunrise: noon - spread, sunset: noon + spread };
};

export const clockLabel = (hour: number) => {
  const minutes = Math.round((((hour % 24) + 24) % 24) * 60);
  return `${Math.floor(minutes / 60) % 24}:${String(minutes % 60).padStart(2, '0')}`;
};
