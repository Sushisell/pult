const DASHBOARD_HISTORY_LENGTH = 5;

export function getDashboardPeriods(categoryId, selectedDate, currentDate) {
  const date = getLatestAllowedDate(selectedDate, currentDate);

  if (categoryId === 'daily') {
    return Array.from({ length: DASHBOARD_HISTORY_LENGTH }, (_, index) => {
      const isoDate = shiftISODate(date, index - (DASHBOARD_HISTORY_LENGTH - 1));
      return { id: isoDate, start: isoDate, end: isoDate };
    });
  }

  if (categoryId === 'weekly') {
    return Array.from({ length: DASHBOARD_HISTORY_LENGTH }, (_, index) => {
      const weekDate = shiftISODate(date, index * -7);
      const period = getWeekPeriod(weekDate);
      return { ...period, id: period.start };
    });
  }

  if (categoryId === 'monthly') {
    return Array.from({ length: DASHBOARD_HISTORY_LENGTH }, (_, index) => {
      const monthDate = shiftISOMonth(date, index * -1);
      const period = getMonthPeriod(monthDate);
      return { ...period, id: period.start };
    });
  }

  const period = getQuarterPeriod(date);
  return [{ ...period, id: period.start }];
}

function getLatestAllowedDate(selectedDate, currentDate) {
  if (!currentDate) return selectedDate;
  return selectedDate > currentDate ? currentDate : selectedDate;
}

function shiftISODate(date, days) {
  const parsed = parseISODate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function shiftISOMonth(date, months) {
  const parsed = parseISODate(date);
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  return parsed.toISOString().slice(0, 10);
}

function getWeekPeriod(date) {
  const parsed = parseISODate(date);
  const day = parsed.getUTCDay() || 7;
  const start = new Date(parsed);
  start.setUTCDate(parsed.getUTCDate() - day + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: toISODate(start), end: toISODate(end) };
}

function getMonthPeriod(date) {
  const parsed = parseISODate(date);
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
  return { start: toISODate(start), end: toISODate(end) };
}

function getQuarterPeriod(date) {
  const parsed = parseISODate(date);
  const quarterStartMonth = Math.floor(parsed.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), quarterStartMonth, 1));
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), quarterStartMonth + 3, 0));
  return { start: toISODate(start), end: toISODate(end) };
}

function parseISODate(date) {
  return new Date(`${date}T00:00:00.000Z`);
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}
