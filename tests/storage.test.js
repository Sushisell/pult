import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadCatalog } from '../src/data-source.js';
import { buildCsv, createEmptyReport, getCompletion, getDueMetricsForDate, getReportForDate, makeReportKey, upsertReport } from '../src/storage.js';
import { CHECKLIST, createCatalog, findEmployeeByFullName, getMetricsForRole, groupMetricsByFrequency } from '../src/checklist.js';
import { APP_VERSION } from '../src/version.js';

describe('daily report storage helpers', () => {
  it('creates a complete empty report for a selected date', () => {
    const report = createEmptyReport('2026-06-01');

    assert.equal(report.date, '2026-06-01');
    assert.equal(report.rows.length, CHECKLIST.length);
    assert.equal(getCompletion(report).percent, 0);
  });

  it('keeps existing answers and backfills missing checklist rows', () => {
    const reports = {
      '2026-06-01': {
        date: '2026-06-01',
        owner: 'Анна',
        rows: [{ id: 'hr-1', status: 'done', value: '', comment: '', updatedAt: '10:00' }],
      },
    };

    const report = getReportForDate(reports, '2026-06-01');

    assert.equal(report.owner, 'Анна');
    assert.equal(report.rows.length, CHECKLIST.length);
    assert.equal(report.rows[0].status, 'done');
    assert.equal(getCompletion(report).percent, Math.round((1 / CHECKLIST.length) * 100));
  });



  it('stores separate reports for different employees on the same date', () => {
    const first = createEmptyReport('2026-06-01', CHECKLIST, 'Коваленко Марина Сергеевна');
    const second = createEmptyReport('2026-06-01', CHECKLIST, 'Иванова Анна Петровна');

    const reports = upsertReport(upsertReport({}, first), second);

    assert.ok(reports[makeReportKey('2026-06-01', 'Коваленко Марина Сергеевна')]);
    assert.ok(reports[makeReportKey('2026-06-01', 'Иванова Анна Петровна')]);
    assert.equal(getReportForDate(reports, '2026-06-01', CHECKLIST, 'Иванова Анна Петровна').owner, 'Иванова Анна Петровна');
  });

  it('hides already filled weekly and monthly metrics in the same period', () => {
    const report = createEmptyReport('2026-06-01', CHECKLIST, 'Коваленко Марина Сергеевна');
    const hrMetrics = getMetricsForRole('HR');
    const weekly = hrMetrics.find((metric) => metric.category === 'weekly');
    const monthly = hrMetrics.find((metric) => metric.category === 'monthly');
    report.rows.find((row) => row.id === weekly.id).status = 'done';
    report.rows.find((row) => row.id === monthly.id).status = 'done';
    const reports = upsertReport({}, report);

    const dueSameWeek = getDueMetricsForDate(reports, '2026-06-03', 'Коваленко Марина Сергеевна', hrMetrics);
    const dueNextWeekSameMonth = getDueMetricsForDate(reports, '2026-06-08', 'Коваленко Марина Сергеевна', hrMetrics);
    const dueNextMonth = getDueMetricsForDate(reports, '2026-07-01', 'Коваленко Марина Сергеевна', hrMetrics);

    assert.equal(dueSameWeek.some((metric) => metric.id === weekly.id), false);
    assert.equal(dueSameWeek.some((metric) => metric.id === monthly.id), false);
    assert.equal(dueNextWeekSameMonth.some((metric) => metric.id === weekly.id), true);
    assert.equal(dueNextWeekSameMonth.some((metric) => metric.id === monthly.id), false);
    assert.equal(dueNextMonth.some((metric) => metric.id === monthly.id), true);
  });

  it('finds a role by FIO on Info and groups matching metrics by frequency', () => {
    const employee = findEmployeeByFullName('Коваленко Марина Сергеевна');
    const metrics = getMetricsForRole(employee.role);
    const groups = groupMetricsByFrequency(metrics);

    assert.equal(employee.role, 'HR');
    assert.deepEqual(groups.map((group) => group.id), ['daily', 'weekly', 'monthly']);
    assert.ok(groups[0].items.every((item) => item.role === 'HR'));
    assert.ok(groups[0].items.every((item) => item.category === 'daily'));
  });

  it('matches metrics when a Google Sheet role cell contains multiple aliases', () => {
    const catalog = createCatalog({
      infoRows: [{ fullName: 'Гелемей Полина', role: 'HRD' }],
      metricSheets: [{
        name: 'Пример заполнения',
        rows: [
          { frequency: '1', metric: 'Проверка дашборда', role: 'HRD / вышестоящий руководитель' },
          { frequency: '1', metric: 'Эскалация', role: 'Эскалация (если не сделано)' },
        ],
      }],
    });

    const employee = findEmployeeByFullName('Гелемей Полина', catalog.infoRows);
    const metrics = getMetricsForRole(employee.role, catalog.checklist);

    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].metric, 'Проверка дашборда');
  });

  it('builds a catalog from external workbook data', () => {
    const catalog = createCatalog({
      infoRows: [{ fullName: 'Реальный Сотрудник', role: 'Операции', managerRole: 'Директор' }],
      metricSheets: [{
        name: 'Операции',
        rows: [
          { frequency: 'ежедневно', metric: 'Проверить смену', role: 'Операции' },
          { frequency: 'ежемесячно', metric: 'Собрать отчёт', role: 'Операции' },
        ],
      }],
    });

    assert.equal(catalog.infoRows[0].fullName, 'Реальный Сотрудник');
    assert.equal(catalog.infoRows[0].managerRole, 'Директор');
    assert.equal(catalog.checklist.length, 2);
    assert.deepEqual(groupMetricsByFrequency(catalog.checklist).map((group) => group.id), ['daily', 'monthly']);
  });

  it('loads catalog data from a configured JSON url', async () => {
    const catalog = await loadCatalog({
      dataUrl: '/workbook.json',
      fetchImpl: async (url) => ({
        ok: url === '/workbook.json',
        async json() {
          return {
            infoRows: [{ fullName: 'Мария Реальная', role: 'Контроль качества' }],
            metricSheets: [{
              name: 'Контроль качества',
              rows: [{ frequency: 'еженедельно', metric: 'Проверить чек-листы', role: 'Контроль качества' }],
            }],
          };
        },
      }),
    });

    assert.equal(catalog.infoRows[0].fullName, 'Мария Реальная');
    assert.equal(catalog.checklist[0].category, 'weekly');
  });

  it('exports rows to csv with role, frequency and status labels', () => {
    const report = createEmptyReport('2026-06-01');
    report.owner = 'Коваленко Марина Сергеевна';
    report.rows[0].status = 'done';
    const csv = buildCsv(upsertReport({}, report));

    assert.match(csv, /Дата,ФИО,Роль,Периодичность,Лист/);
    assert.match(csv, /Коваленко Марина Сергеевна,HR,Ежедневно,HR/);
    assert.match(csv, /Всё ок/);
  });
});

describe('application version', () => {
  it('keeps package, header fallback and runtime version in sync', async () => {
    const [packageJson, indexHtml] = await Promise.all([
      readFile(new URL('../package.json', import.meta.url), 'utf8'),
      readFile(new URL('../index.html', import.meta.url), 'utf8'),
    ]);
    const packageVersion = JSON.parse(packageJson).version;

    assert.equal(APP_VERSION, packageVersion);
    assert.match(indexHtml, new RegExp(`id="app-version"[^>]*>v${packageVersion}</span>`));
  });
});
