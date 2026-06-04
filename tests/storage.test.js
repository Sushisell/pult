import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadCatalog } from '../src/data-source.js';
import { buildCsv, createEmptyReport, getCompletion, getReportForDate, upsertReport } from '../src/storage.js';
import { CHECKLIST, createCatalog, findEmployeeByFullName, getMetricsForRole, groupMetricsByFrequency } from '../src/checklist.js';

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

  it('finds a role by FIO on Info and groups matching metrics by frequency', () => {
    const employee = findEmployeeByFullName('Коваленко Марина Сергеевна');
    const metrics = getMetricsForRole(employee.role);
    const groups = groupMetricsByFrequency(metrics);

    assert.equal(employee.role, 'HR');
    assert.deepEqual(groups.map((group) => group.id), ['daily', 'weekly', 'monthly']);
    assert.ok(groups[0].items.every((item) => item.role === 'HR'));
    assert.ok(groups[0].items.every((item) => item.category === 'daily'));
  });

  it('builds a catalog from external workbook data', () => {
    const catalog = createCatalog({
      infoRows: [{ fullName: 'Реальный Сотрудник', role: 'Операции' }],
      metricSheets: [{
        name: 'Операции',
        rows: [
          { frequency: 'ежедневно', metric: 'Проверить смену', role: 'Операции' },
          { frequency: 'ежемесячно', metric: 'Собрать отчёт', role: 'Операции' },
        ],
      }],
    });

    assert.equal(catalog.infoRows[0].fullName, 'Реальный Сотрудник');
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
