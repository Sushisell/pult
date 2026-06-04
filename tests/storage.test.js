import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCsv, createEmptyReport, getCompletion, getReportForDate, upsertReport } from '../src/storage.js';
import { CHECKLIST } from '../src/checklist.js';

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

  it('exports rows to csv with status labels', () => {
    const report = createEmptyReport('2026-06-01');
    report.owner = 'Иван';
    report.rows[0].status = 'done';
    const csv = buildCsv(upsertReport({}, report));

    assert.match(csv, /Дата,ФИО,Раздел/);
    assert.match(csv, /Иван/);
    assert.match(csv, /Всё ок/);
  });
});
