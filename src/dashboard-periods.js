const DASHBOARD_HISTORY_LENGTH = 5;

export function getDashboardPeriods(categoryId, selectedDate, currentDate) {
  const date = getLatestAllowedDate(selectedDate, currentDate);

  if (categoryId === 'daily') {
    return Array.from({ length: DASHBOARD_HISTORY_LENGTH }, (_, index) => {
      const isoDate = shiftISODate(date, index - (DASHBOARD_HISTORY_LENGTH - 1));
      return { id: isoDate, start: isoDate, end: isoDate, kind: 'daily' };
    });
  }

  if (categoryId === 'weekly') {
    return Array.from({ length: DASHBOARD_HISTORY_LENGTH }, (_, index) => {
      const weekDate = shiftISODate(date, index * -7);
      const period = getWeekPeriod(weekDate);
      return { ...period, id: period.start, kind: 'weekly' };
    }).reverse();
  }

  if (categoryId === 'monthly') {
    return Array.from({ length: DASHBOARD_HISTORY_LENGTH }, (_, index) => {
      const monthDate = shiftISOMonth(date, index * -1);
      const period = getMonthPeriod(monthDate);
      return { ...period, id: period.start, kind: 'monthly' };
    }).reverse();
  }

  const period = getQuarterPeriod(date);
  return [{ ...period, id: period.start, kind: 'quarterly' }];
}

export function filterWeekendDashboardStates(states) {
  return states.filter((entry) => (
    entry.metric.category !== 'daily'
    || !isWeekendISODate(entry.period.start)
    || entry.filled
    || entry.metric.weekendRequired === true
  ));
}

export function calculateDashboardIndexes(states) {
  const total = states.length;
  const filled = states.filter((entry) => entry.status !== 'empty').length;
  const issues = states.filter((entry) => entry.status === 'issue').length;

  return {
    health: filled === 0 ? 0 : Math.round(((filled - issues) / filled) * 100),
    completion: total === 0 ? 0 : Math.round((filled / total) * 100),
    filled,
    total,
  };
}

export function getCompletionZone(completion) {
  if (completion < 85) return 'danger';
  if (completion < 95) return 'warning';
  return 'success';
}

function isWeekendISODate(date) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
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
