import { CATEGORIES, CHECKLIST, STATUS } from './checklist.js';

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

export function createEmptyReport(date = todayISO()) {
  return {
    date,
    owner: 'Коваленко Марина Сергеевна',
    rows: CHECKLIST.map(createEmptyRow),
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

export function getReportForDate(reports, date) {
  const current = reports[date];
  if (!current) return createEmptyReport(date);

  const rowsById = new Map(current.rows.map((row) => [row.id, row]));
  return {
    ...createEmptyReport(date),
    ...current,
    rows: CHECKLIST.map((item) => ({
      ...createEmptyRow(item),
      ...rowsById.get(item.id),
    })),
  };
}

export function getCompletion(report) {
  const total = report.rows.length;
  const done = report.rows.filter((row) => row.status === 'done').length;
  const issues = report.rows.filter((row) => row.status === 'issue' || row.comment?.trim()).length;
  return {
    total,
    done,
    issues,
    skipped: report.rows.filter((row) => row.status !== 'done').length,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function buildSummaryRows(reports) {
  return Object.values(reports)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((report) => ({
      ...report,
      completion: getCompletion(report),
    }));
}

export function buildCsv(reports) {
  const header = ['Дата', 'ФИО', 'Раздел', '№', 'Задача / метрика', 'Формат отчёта', 'Статус', 'Значение', 'Комментарий', 'Обновлено'];
  const rows = Object.values(reports)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((report) => report.rows.map((row) => {
      const item = CHECKLIST.find((entry) => entry.id === row.id);
      return [
        report.date,
        report.owner,
        CATEGORIES.find((category) => category.id === item?.category)?.label ?? '',
        row.id,
        item?.metric ?? '',
        item?.reportFormat ?? '',
        STATUS[row.status] ?? row.status,
        row.value,
        row.comment,
        row.updatedAt,
      ];
    }));

  return [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
}

function escapeCsvCell(cell) {
  const value = String(cell ?? '');
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
