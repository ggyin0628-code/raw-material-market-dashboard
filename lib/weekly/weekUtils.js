const TAIPEI_OFFSET_MINUTES = 8 * 60;

function pad(value) {
  return String(value).padStart(2, "0");
}

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error("日期格式錯誤");
  return date;
}

function toTaipeiDate(value) {
  const date = asDate(value);
  return new Date(date.getTime() + TAIPEI_OFFSET_MINUTES * 60 * 1000);
}

function dateKeyInTaipei(value) {
  const date = toTaipeiDate(value);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dateKeyFromUtc(value) {
  const date = asDate(value);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) throw new Error("日期格式錯誤");
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("日期格式錯誤");
  return date;
}

function addDays(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKeyFromUtc(date);
}

function startOfMonday(dateKey) {
  const date = parseDateKey(dateKey);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDays(dateKey, -daysSinceMonday);
}

function isoWeekFromDateKey(dateKey) {
  const date = parseDateKey(dateKey);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(week)}`;
}

function invalidWeek(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseReportingWeek(reportingWeek) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(reportingWeek || ""));
  if (!match) throw invalidWeek("週期格式錯誤，請使用 YYYY-Www");
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) throw invalidWeek("週期格式錯誤，週數必須介於 01 與 53");
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime());
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  const computed = isoWeekFromDateKey(dateKeyFromUtc(monday));
  if (computed !== reportingWeek) throw invalidWeek("週期格式錯誤，ISO week 不存在");
  const start = dateKeyFromUtc(monday);
  return { reportingWeek, start, end: addDays(start, 6), previousStart: addDays(start, -7), previousEnd: addDays(start, -1) };
}

function previousCompletedWeek(value = new Date()) {
  const currentTaipeiDate = dateKeyInTaipei(value);
  const currentWeekStart = startOfMonday(currentTaipeiDate);
  const start = addDays(currentWeekStart, -7);
  return { reportingWeek: isoWeekFromDateKey(start), start, end: addDays(start, 6), previousStart: addDays(start, -7), previousEnd: addDays(start, -1) };
}

function rangeContains(dateKey, from, to) {
  return dateKey >= from && dateKey <= to;
}

function dayDifference(from, to) {
  return Math.round((parseDateKey(to) - parseDateKey(from)) / 86400000);
}

module.exports = {
  TAIPEI_OFFSET_MINUTES,
  asDate,
  toTaipeiDate,
  dateKeyInTaipei,
  dateKeyFromUtc,
  parseDateKey,
  addDays,
  startOfMonday,
  isoWeekFromDateKey,
  parseReportingWeek,
  previousCompletedWeek,
  rangeContains,
  dayDifference,
};
