export type ThemePreference = "follow" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const BEIJING_LATITUDE = 39.9042;
const BEIJING_LONGITUDE = 116.4074;
const ZENITH = 90.833;

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizeHours(value: number): number {
  return ((value % 24) + 24) % 24;
}

function getDayOfYear(date: Date): number {
  const beijingYear = Number(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(date));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 1);
  const start = Date.UTC(beijingYear, 0, 1);
  return Math.floor((Date.UTC(beijingYear, month - 1, day) - start) / 86_400_000) + 1;
}

function calculateSunUtcHour(date: Date, sunrise: boolean): number {
  const dayOfYear = getDayOfYear(date);
  const longitudeHour = BEIJING_LONGITUDE / 15;
  const approximateTime = dayOfYear + ((sunrise ? 6 : 18) - longitudeHour) / 24;
  const meanAnomaly = (0.9856 * approximateTime) - 3.289;
  const trueLongitude = normalizeDegrees(
    meanAnomaly
    + 1.916 * Math.sin(degreesToRadians(meanAnomaly))
    + 0.020 * Math.sin(degreesToRadians(2 * meanAnomaly))
    + 282.634,
  );
  let rightAscension = normalizeDegrees(radiansToDegrees(Math.atan(0.91764 * Math.tan(degreesToRadians(trueLongitude)))));
  rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
  rightAscension /= 15;

  const sinDeclination = 0.39782 * Math.sin(degreesToRadians(trueLongitude));
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosHour = (
    Math.cos(degreesToRadians(ZENITH))
    - sinDeclination * Math.sin(degreesToRadians(BEIJING_LATITUDE))
  ) / (cosDeclination * Math.cos(degreesToRadians(BEIJING_LATITUDE)));
  const hourAngle = sunrise
    ? 360 - radiansToDegrees(Math.acos(cosHour))
    : radiansToDegrees(Math.acos(cosHour));
  const localMeanTime = hourAngle / 15 + rightAscension - 0.06571 * approximateTime - 6.622;
  return normalizeHours(localMeanTime - longitudeHour);
}

export function getBeijingSolarHours(date: Date): { sunriseHour: number; sunsetHour: number } {
  return {
    sunriseHour: normalizeHours(calculateSunUtcHour(date, true) + 8),
    sunsetHour: normalizeHours(calculateSunUtcHour(date, false) + 8),
  };
}

export function getBeijingDecimalHour(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const second = Number(parts.find((part) => part.type === "second")?.value ?? 0);
  return hour + minute / 60 + second / 3600;
}

export function resolveTheme(preference: ThemePreference, date = new Date()): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  const { sunriseHour, sunsetHour } = getBeijingSolarHours(date);
  const currentHour = getBeijingDecimalHour(date);
  return currentHour >= sunriseHour && currentHour < sunsetHour ? "light" : "dark";
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "follow" ? value : "follow";
}
