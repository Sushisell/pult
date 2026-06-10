import { CATEGORIES, CHECKLIST, INFO_ROWS, STATUS, findEmployeeByFullName, getMetricsForRole } from './checklist.js?v=0.1.5';

const STORAGE_KEY = 'pult.dailyChecks.v1';
const REPORT_KEY_SEPARATOR = '::';
const FILLED_STATUS_VALUES = new Set(['done', 'fixed', 'issue']);

export function todayISO(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

export function createEmptyRow(item) {
  return {
    id: item.id,
    status: '',
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
    submittedCategories: {},
    submittedMetricIds: {},
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

export function mergeReports(baseReports = {}, incomingReports = {}) {
  return Object.values(incomingReports).reduce((reports, report) => {
    const key = makeReportKey(report.date, report.owner);
    const current = reports[key];
    if (!current) return { ...reports, [key]: report };

    const incomingRowsById = new Map(report.rows.map((row) => [row.id, row]));
    return {
      ...reports,
      [key]: {
        ...current,
        rows: current.rows.map((row) => ({
          ...row,
          ...incomingRowsById.get(row.id),
        })),
        submittedCategories: {
          ...(current.submittedCategories ?? {}),
          ...(report.submittedCategories ?? {}),
        },
        submittedMetricIds: {
          ...(current.submittedMetricIds ?? {}),
          ...(report.submittedMetricIds ?? {}),
        },
      },
    };
  }, baseReports);
}

export function buildReportsFromDataRows(dataRows = [], checklist = CHECKLIST) {
  return dataRows.reduce((reports, dataRow) => {
    const metric = findMetricByName(dataRow.metric, checklist);
    if (!metric) return reports;

    const report = getReportForDate(reports, dataRow.date, checklist, dataRow.owner);
    const rows = report.rows.map((row) => {
      if (row.id !== metric.id) return row;
      const value = String(dataRow.value ?? '');
      const comment = String(dataRow.comment ?? '');
      return {
        ...row,
        value,
        comment,
        status: metric.type === 'number' ? row.status : getStatusFromStoredValue(value, row.status),
      };
    });

    return upsertReport(reports, {
      ...report,
      rows,
      submittedCategories: {
        ...(report.submittedCategories ?? {}),
        [metric.category]: true,
      },
      submittedMetricIds: {
        ...(report.submittedMetricIds ?? {}),
        [metric.id]: true,
      },
    });
  }, {});
}

export function buildDataRows(report, metrics = CHECKLIST) {
  const metricIds = new Set(metrics.map((metric) => metric.id));
  return report.rows
    .filter((row) => metricIds.has(row.id) && isRowFilled(row))
    .map((row) => {
      const metric = metrics.find((item) => item.id === row.id);
      return {
        date: report.date,
        owner: report.owner,
        metric: metric?.metric ?? row.id,
        value: getStoredValue(row, metric),
        comment: String(row.comment ?? '').trim(),
      };
    });
}

export function getReportForDate(reports, date, checklist = CHECKLIST, defaultOwner = getDefaultOwner()) {
  const owner = String(defaultOwner ?? '').trim();
  const current = reports[makeReportKey(date, owner)] ?? getLegacyReport(reports, date, owner);
  if (!current) return createEmptyReport(date, checklist, owner);

  const rowsById = new Map(current.rows.map((row) => [row.id, row]));
  const rows = checklist.map((item) => normalizeStoredRow({
    ...createEmptyRow(item),
    ...rowsById.get(item.id),
  }));
  const report = {
    ...createEmptyReport(date, checklist, owner),
    ...current,
    date,
    owner: current.owner || owner,
    rows,
  };

  return {
    ...report,
    submittedMetricIds: normalizeSubmittedMetricIds(report, checklist),
  };
}

function normalizeStoredRow(row) {
  return {
    ...row,
    status: row.status === 'skipped' ? '' : row.status,
  };
}

function normalizeSubmittedMetricIds(report, checklist) {
  const submittedMetricIds = { ...(report.submittedMetricIds ?? {}) };

  for (const metric of checklist) {
    const row = report.rows.find((entry) => entry.id === metric.id);
    if (report.submittedCategories?.[metric.category] && row && isRowFilled(row)) {
      submittedMetricIds[metric.id] = true;
    }
  }

  return submittedMetricIds;
}

export function getCompletion(report, metrics = CHECKLIST) {
  const metricIds = new Set(metrics.map((item) => item.id));
  const rows = report.rows.filter((row) => metricIds.has(row.id));
  const total = rows.length;
  const done = rows.filter(isRowFilled).length;
  const issues = rows.filter((row) => row.status === 'fixed' || row.status === 'issue' || row.comment?.trim()).length;
  return {
    total,
    done,
    issues,
    skipped: rows.filter((row) => !isRowFilled(row)).length,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function isReportSubmittedForCategory(report, category, metrics = CHECKLIST) {
  const categoryMetrics = metrics.filter((metric) => metric.category === category);
  return Boolean(report?.submittedCategories?.[category]) || areAllMetricsSubmitted(report, categoryMetrics);
}

export function markReportSubmittedForCategory(report, category) {
  return {
    ...report,
    submittedCategories: {
      ...(report.submittedCategories ?? {}),
      [category]: true,
    },
  };
}

export function isMetricSubmitted(report, metricId) {
  return Boolean(report?.submittedMetricIds?.[metricId]);
}

export function getPendingFilledMetrics(report, metrics = CHECKLIST) {
  return metrics.filter((metric) => isMetricFilled(report, metric.id) && !isMetricSubmitted(report, metric.id));
}

export function areAllMetricsSubmitted(report, metrics = CHECKLIST) {
  return metrics.length > 0 && metrics.every((metric) => isMetricSubmitted(report, metric.id));
}

export function markReportMetricsSubmitted(report, metrics = CHECKLIST) {
  const submittedMetricIds = { ...(report.submittedMetricIds ?? {}) };

  for (const metric of metrics) {
    if (isMetricFilled(report, metric.id)) submittedMetricIds[metric.id] = true;
  }

  return {
    ...report,
    submittedMetricIds,
  };
}

export function getDueMetricsForDate(reports, date, owner, metrics = CHECKLIST, options = {}) {
  return metrics.filter((metric) => shouldShowMetricForDate(reports, date, owner, metric, options));
}

export function shouldShowMetricForDate(reports, date, owner, metric, { hideSubmittedForDate = false } = {}) {
  const reportAlreadyHasMetric = (report) => (
    report.owner === owner
    && isMetricFilled(report, metric.id)
    && (report.date !== date || (hideSubmittedForDate && isMetricSubmitted(report, metric.id)))
  );

  if (metric.category === 'daily') {
    return !Object.values(reports).some((report) => report.date === date && reportAlreadyHasMetric(report));
  }

  const period = metric.category === 'weekly' ? getWeekPeriod(date) : getMonthPeriod(date);
  if (!period) return true;

  return !Object.values(reports).some((report) => (
    report.date >= period.start
    && report.date <= period.end
    && reportAlreadyHasMetric(report)
  ));
}

export function isMetricFilled(report, metricId) {
  const row = report.rows.find((entry) => entry.id === metricId);
  return Boolean(row && isRowFilled(row));
}

export function isRowFilled(row) {
  return FILLED_STATUS_VALUES.has(row.status)
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
          getStatusLabel(row.status),
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

function getStatusLabel(status) {
  return STATUS[status] ?? '';
}

function getStoredValue(row, metric) {
  if (metric?.type === 'number') return String(row.value ?? '').trim();
  if (String(row.value ?? '').trim()) return String(row.value ?? '').trim();
  return STATUS[row.status] ?? '';
}

function getStatusFromStoredValue(value, fallback = '') {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized.includes('исправлен') || normalized.includes('fixed')) return 'fixed';
  if (normalized.includes('нельзя') || normalized.includes('невозмож') || normalized.includes('проблем') || normalized.includes('ошиб') || normalized.includes('issue')) return 'issue';
  return 'done';
}

function findMetricByName(metricName, checklist) {
  const normalizedMetricName = normalizeText(metricName);
  return checklist.find((metric) => normalizeText(metric.metric) === normalizedMetricName);
}

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
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
