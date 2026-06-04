import { CATEGORIES, CHECKLIST, INFO_ROWS, STATUS, findEmployeeByFullName, getMetricsForRole } from './checklist.js';

const STORAGE_KEY = 'pult.dailyChecks.v1';

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

export function upsertReport(reports, report) {
  return {
    ...reports,
    [report.date]: report,
  };
}

export function getReportForDate(reports, date, checklist = CHECKLIST, defaultOwner = getDefaultOwner()) {
  const current = reports[date];
  if (!current) return createEmptyReport(date, checklist, defaultOwner);

  const rowsById = new Map(current.rows.map((row) => [row.id, row]));
  return {
    ...createEmptyReport(date, checklist, defaultOwner),
    ...current,
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
  const done = rows.filter((row) => row.status === 'done').length;
  const issues = rows.filter((row) => row.status === 'issue' || row.comment?.trim()).length;
  return {
    total,
    done,
    issues,
    skipped: rows.filter((row) => row.status !== 'done').length,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function buildSummaryRows(reports, catalog = getDefaultCatalog()) {
  return Object.values(reports)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((report) => ({
      ...report,
      completion: getCompletion(report, getReportMetrics(report, catalog)),
    }));
}

export function buildCsv(reports, catalog = getDefaultCatalog()) {
  const header = ['Дата', 'ФИО', 'Роль', 'Периодичность', 'Лист', '№', 'Задача / метрика', 'Формат отчёта', 'Статус', 'Значение', 'Комментарий', 'Обновлено'];
  const rows = Object.values(reports)
    .sort((a, b) => a.date.localeCompare(b.date))
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
