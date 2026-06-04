import { CATEGORIES, CHECKLIST, INFO_ROWS, STATUS, findEmployeeByFullName, getMetricsForRole } from './checklist.js';

const STORAGE_KEY = 'pult.dailyChecks.v1';
const REPORT_KEY_SEPARATOR = '::';

export function todayISO(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

export function createEmptyRow(item) {
  return {
    id: item.id,
    status: 'skipped',
    value: '',
    comment: '',
    updatedAt: '',
  };
}

export function createEmptyReport(date = todayISO(), checklist = CHECKLIST, defaultOwner = getDefaultOwner()) {
  return {
    date,
    owner: defaultOwner,
    rows: checklist.map(createEmptyRow),
  };
}

export function loadReports(storage = window.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveReports(reports, storage = window.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

export function makeReportKey(date, owner = '') {
  const normalizedOwner = String(owner ?? '').trim();
  return normalizedOwner ? `${date}${REPORT_KEY_SEPARATOR}${normalizedOwner}` : date;
}

export function upsertReport(reports, report) {
  return {
    ...reports,
    [makeReportKey(report.date, report.owner)]: report,
  };
}

export function getReportForDate(reports, date, checklist = CHECKLIST, defaultOwner = getDefaultOwner()) {
  const owner = String(defaultOwner ?? '').trim();
  const current = reports[makeReportKey(date, owner)] ?? getLegacyReport(reports, date, owner);
  if (!current) return createEmptyReport(date, checklist, owner);

  const rowsById = new Map(current.rows.map((row) => [row.id, row]));
  return {
    ...createEmptyReport(date, checklist, owner),
    ...current,
    date,
    owner: current.owner || owner,
    rows: checklist.map((item) => ({
      ...createEmptyRow(item),
      ...rowsById.get(item.id),
    })),
  };
}

export function getCompletion(report, metrics = CHECKLIST) {
  const metricIds = new Set(metrics.map((item) => item.id));
  const rows = report.rows.filter((row) => metricIds.has(row.id));
  const total = rows.length;
  const done = rows.filter(isRowFilled).length;
  const issues = rows.filter((row) => row.status === 'issue' || row.comment?.trim()).length;
  return {
    total,
    done,
    issues,
    skipped: rows.filter((row) => !isRowFilled(row)).length,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function getDueMetricsForDate(reports, date, owner, metrics = CHECKLIST) {
  return metrics.filter((metric) => shouldShowMetricForDate(reports, date, owner, metric));
}

export function shouldShowMetricForDate(reports, date, owner, metric) {
  if (metric.category === 'daily') return true;
  const period = metric.category === 'weekly' ? getWeekPeriod(date) : getMonthPeriod(date);
  if (!period) return true;

  return !Object.values(reports).some((report) => (
    report.owner === owner
    && report.date !== date
    && report.date >= period.start
    && report.date <= period.end
    && isMetricFilled(report, metric.id)
  ));
}

export function isMetricFilled(report, metricId) {
  const row = report.rows.find((entry) => entry.id === metricId);
  return Boolean(row && isRowFilled(row));
}

export function isRowFilled(row) {
  return row.status === 'done'
    || row.status === 'issue'
    || Boolean(String(row.value ?? '').trim())
    || Boolean(String(row.comment ?? '').trim());
}

export function buildSummaryRows(reports, catalog = getDefaultCatalog()) {
  return Object.values(reports)
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.owner).localeCompare(String(b.owner)))
    .map((report) => ({
      ...report,
      completion: getCompletion(report, getReportMetrics(report, catalog)),
    }));
}

export function buildCsv(reports, catalog = getDefaultCatalog()) {
  const header = ['Дата', 'ФИО', 'Роль', 'Периодичность', 'Лист', '№', 'Задача / метрика', 'Формат отчёта', 'Статус', 'Значение', 'Комментарий', 'Обновлено'];
  const rows = Object.values(reports)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.owner).localeCompare(String(b.owner)))
    .flatMap((report) => {
      const reportMetricIds = new Set(getReportMetrics(report, catalog).map((metric) => metric.id));
      return report.rows.filter((row) => reportMetricIds.has(row.id)).map((row) => {
        const item = catalog.checklist.find((entry) => entry.id === row.id);
        return [
          report.date,
          report.owner,
          item?.role ?? '',
          CATEGORIES.find((category) => category.id === item?.category)?.label ?? '',
          item?.sourceSheet ?? '',
          row.id,
          item?.metric ?? '',
          item?.reportFormat ?? '',
          STATUS[row.status] ?? row.status,
          row.value,
          row.comment,
          row.updatedAt,
        ];
      });
    });

  return [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
}

function getLegacyReport(reports, date, owner) {
  const report = reports[date];
  if (!report) return null;
  return report;
}

function getWeekPeriod(date) {
  const parsed = parseISODate(date);
  if (!parsed) return null;
  const day = parsed.getUTCDay() || 7;
  const start = new Date(parsed);
  start.setUTCDate(parsed.getUTCDate() - day + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: toISODate(start), end: toISODate(end) };
}

function getMonthPeriod(date) {
  const parsed = parseISODate(date);
  if (!parsed) return null;
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
  return { start: toISODate(start), end: toISODate(end) };
}

function parseISODate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function getReportMetrics(report, catalog) {
  const employee = findEmployeeByFullName(report.owner, catalog.infoRows);
  return employee ? getMetricsForRole(employee.role, catalog.checklist) : catalog.checklist;
}

function getDefaultCatalog() {
  return {
    infoRows: INFO_ROWS,
    checklist: CHECKLIST,
  };
}

function getDefaultOwner(infoRows = INFO_ROWS) {
  return infoRows[0]?.fullName ?? '';
}

function escapeCsvCell(cell) {
  const value = String(cell ?? '');
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
