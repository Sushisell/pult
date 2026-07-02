import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadCatalog, submitDataRows } from '../src/data-source.js';
import { areAllMetricsSubmitted, buildCsv, buildDataRows, buildReportsFromDataRows, createEmptyReport, getCompletion, getDueMetricsForDate, getPendingFilledMetrics, getReportForDate, isMetricSubmitted, isReportSubmittedForCategory, makeReportKey, markReportMetricsSubmitted, markReportSubmittedForCategory, mergeReportFilledRows, reconcileSubmittedMetricsWithSheetReports, upsertReport } from '../src/storage.js';
import { CHECKLIST, createCatalog, createChecklist, findEmployeeByFullName, getMetricsForRole, groupMetricsByFrequency } from '../src/checklist.js';
import { APP_VERSION } from '../src/version.js';


const TEST_INFO_ROWS = [
  { fullName: 'Тестовый Сотрудник HR', role: 'HR', managerRole: 'Операционный директор' },
  { fullName: 'Тестовый Сотрудник Франчайзинг', role: 'Франчайзинг', managerRole: 'Операционный директор' },
];

const TEST_METRIC_SHEETS = [{
  name: 'HR',
  rows: [
    { frequency: 'ежедневно', metric: 'Проверка HR', role: 'HR', reportFormat: 'Проверено / не проверено', type: 'checkbox' },
    { frequency: 'еженедельно', metric: 'Еженедельная HR проверка', role: 'HR', reportFormat: 'Комментарий', type: 'checkboxWithText' },
    { frequency: 'ежемесячно', metric: 'Ежемесячная HR проверка', role: 'HR', reportFormat: 'Проверено / не проверено', type: 'checkbox' },
  ],
}];

const TEST_CHECKLIST = createChecklist(TEST_METRIC_SHEETS);
const TEST_CATALOG = createCatalog({ infoRows: TEST_INFO_ROWS, metricSheets: TEST_METRIC_SHEETS });

describe('daily report storage helpers', () => {
  it('creates a complete empty report for a selected date', () => {
    const report = createEmptyReport('2026-06-01');

    assert.equal(report.date, '2026-06-01');
    assert.equal(report.rows.length, CHECKLIST.length);
    assert.ok(report.rows.every((row) => row.status === ''));
    assert.equal(getCompletion(report).percent, 0);
  });

  it('keeps existing answers and backfills missing checklist rows', () => {
    const reports = {
      '2026-06-01': {
        date: '2026-06-01',
        owner: 'Анна',
        rows: [{ id: TEST_CHECKLIST[0].id, status: 'done', value: '', comment: '', updatedAt: '10:00' }],
      },
    };

    const report = getReportForDate(reports, '2026-06-01', TEST_CHECKLIST);

    assert.equal(report.owner, 'Анна');
    assert.equal(report.rows.length, TEST_CHECKLIST.length);
    assert.equal(report.rows[0].status, 'done');
    assert.equal(getCompletion(report, TEST_CHECKLIST).percent, Math.round((1 / TEST_CHECKLIST.length) * 100));
  });



  it('stores separate reports for different employees on the same date', () => {
    const first = createEmptyReport('2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник HR');
    const second = createEmptyReport('2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник Франчайзинг');

    const reports = upsertReport(upsertReport({}, first), second);

    assert.ok(reports[makeReportKey('2026-06-01', 'Тестовый Сотрудник HR')]);
    assert.ok(reports[makeReportKey('2026-06-01', 'Тестовый Сотрудник Франчайзинг')]);
    assert.equal(getReportForDate(reports, '2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник Франчайзинг').owner, 'Тестовый Сотрудник Франчайзинг');
  });

  it('hides already filled weekly and monthly metrics in the same period', () => {
    const report = createEmptyReport('2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник HR');
    const hrMetrics = getMetricsForRole('HR', TEST_CHECKLIST);
    const weekly = hrMetrics.find((metric) => metric.category === 'weekly');
    const monthly = hrMetrics.find((metric) => metric.category === 'monthly');
    report.rows.find((row) => row.id === weekly.id).status = 'done';
    report.rows.find((row) => row.id === monthly.id).status = 'done';
    const reports = upsertReport({}, report);

    const dueSameWeek = getDueMetricsForDate(reports, '2026-06-03', 'Тестовый Сотрудник HR', hrMetrics);
    const dueNextWeekSameMonth = getDueMetricsForDate(reports, '2026-06-08', 'Тестовый Сотрудник HR', hrMetrics);
    const dueNextMonth = getDueMetricsForDate(reports, '2026-07-01', 'Тестовый Сотрудник HR', hrMetrics);

    assert.equal(dueSameWeek.some((metric) => metric.id === weekly.id), false);
    assert.equal(dueSameWeek.some((metric) => metric.id === monthly.id), false);
    assert.equal(dueNextWeekSameMonth.some((metric) => metric.id === weekly.id), true);
    assert.equal(dueNextWeekSameMonth.some((metric) => metric.id === monthly.id), false);
    assert.equal(dueNextMonth.some((metric) => metric.id === monthly.id), true);
  });

  it('hides daily metrics already submitted for the selected date but keeps drafts visible', () => {
    const report = createEmptyReport('2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник HR');
    const hrMetrics = getMetricsForRole('HR', TEST_CHECKLIST);
    const daily = hrMetrics.find((metric) => metric.category === 'daily');
    report.rows.find((row) => row.id === daily.id).status = 'done';
    const draftReports = upsertReport({}, report);
    const submittedReports = upsertReport({}, markReportMetricsSubmitted(report, [daily]));

    const dueDraft = getDueMetricsForDate(draftReports, '2026-06-01', 'Тестовый Сотрудник HR', hrMetrics, { hideSubmittedForDate: true });
    const dueSubmitted = getDueMetricsForDate(submittedReports, '2026-06-01', 'Тестовый Сотрудник HR', hrMetrics, { hideSubmittedForDate: true });
    const dueSubmittedForDashboard = getDueMetricsForDate(submittedReports, '2026-06-01', 'Тестовый Сотрудник HR', hrMetrics);
    const dueNextDay = getDueMetricsForDate(submittedReports, '2026-06-02', 'Тестовый Сотрудник HR', hrMetrics, { hideSubmittedForDate: true });

    assert.equal(dueDraft.some((metric) => metric.id === daily.id), true);
    assert.equal(dueSubmitted.some((metric) => metric.id === daily.id), false);
    assert.equal(dueSubmittedForDashboard.some((metric) => metric.id === daily.id), true);
    assert.equal(dueNextDay.some((metric) => metric.id === daily.id), true);
  });

  it('can hide filled daily metric drafts on the selected date', () => {
    const report = createEmptyReport('2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник HR');
    const hrMetrics = getMetricsForRole('HR', TEST_CHECKLIST);
    const daily = hrMetrics.find((metric) => metric.category === 'daily');
    report.rows.find((row) => row.id === daily.id).status = 'done';
    const reports = upsertReport({}, report);

    const dueMetrics = getDueMetricsForDate(reports, '2026-06-01', 'Тестовый Сотрудник HR', hrMetrics, { hideFilledForDate: true });

    assert.equal(dueMetrics.some((metric) => metric.id === daily.id), false);
  });

  it('finds a role by FIO on Info and groups matching metrics by frequency', () => {
    const employee = findEmployeeByFullName('Тестовый Сотрудник HR', TEST_CATALOG.infoRows);
    const metrics = getMetricsForRole(employee.role, TEST_CATALOG.checklist);
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

  it('shows metrics for every simultaneous employee position', () => {
    const catalog = createCatalog({
      infoRows: [{ fullName: 'Мария Совмещает', role: 'HR / Маркетинг' }],
      metricSheets: [
        { name: 'HR', rows: [{ frequency: 'ежедневно', metric: 'HR проверка', role: 'HR' }] },
        { name: 'Маркетинг', rows: [{ frequency: 'ежедневно', metric: 'Маркетинг проверка', role: 'Маркетинг' }] },
      ],
    });

    const employee = findEmployeeByFullName('Мария Совмещает', catalog.infoRows);
    const metrics = getMetricsForRole(employee.role, catalog.checklist);

    assert.deepEqual(metrics.map((metric) => metric.metric), ['HR проверка', 'Маркетинг проверка']);
  });

  it('merges duplicate Info rows for one employee into all employee positions', () => {
    const catalog = createCatalog({
      infoRows: [
        { fullName: 'Мялицына Виктория', role: 'Рук. отдела персонала РС' },
        { fullName: 'Мялицына Виктория', role: 'Рук. отдела персонала' },
      ],
      metricSheets: [{
        name: 'Персонал',
        rows: [
          { frequency: 'ежедневно', metric: 'Проверка карьерного сайта', role: 'Рук. отдела персонала РС' },
          { frequency: 'ежедневно', metric: 'Индекс вежливости компании на HH', role: 'Рук. отдела персонала' },
        ],
      }],
    });

    const employee = findEmployeeByFullName('Мялицына Виктория', catalog.infoRows);
    const metrics = getMetricsForRole(employee.role, catalog.checklist);

    assert.equal(catalog.infoRows.length, 1);
    assert.equal(employee.role, 'Рук. отдела персонала РС, Рук. отдела персонала');
    assert.deepEqual(metrics.map((metric) => metric.metric), ['Проверка карьерного сайта', 'Индекс вежливости компании на HH']);
  });

  it('builds a catalog from external workbook data', () => {
    const catalog = createCatalog({
      infoRows: [{ fullName: 'Реальный Сотрудник', role: 'Операции', managerRole: 'Директор' }],
      metricSheets: [{
        name: 'Операции',
        rows: [
          { frequency: 'ежедневно', metric: 'Проверить смену', description: 'Сверить все открытые смены', goal: 'Нет незакрытых смен', deadline: '18:00', role: 'Операции', managerRole: 'Директор' },
          { frequency: 'ежемесячно', metric: 'Собрать отчёт', role: 'Операции' },
        ],
      }],
    });

    assert.equal(catalog.infoRows[0].fullName, 'Реальный Сотрудник');
    assert.equal(catalog.infoRows[0].managerRole, 'Директор');
    assert.equal(catalog.checklist.length, 2);
    assert.equal(catalog.checklist[0].description, 'Сверить все открытые смены');
    assert.equal(catalog.checklist[0].goal, 'Нет незакрытых смен');
    assert.equal(catalog.checklist[0].deadline, '18:00');
    assert.equal(catalog.checklist[0].managerRole, 'Директор');
    assert.equal(createCatalog({ metricSheets: [{ name: 'Типы', rows: [{ frequency: 'ежедневно', metric: 'Число', role: 'Операции', classification: 'Ввод числа' }] }] }).checklist[0].type, 'number');
    assert.equal(createCatalog({ metricSheets: [{ name: 'Типы', rows: [{ frequency: 'ежедневно', metric: 'Конверсия', role: 'Операции', classification: 'Ввод процента' }] }] }).checklist[0].type, 'percent');
    assert.deepEqual(groupMetricsByFrequency(catalog.checklist).map((group) => group.id), ['daily', 'monthly']);
  });

  it('drops stale local submitted flags that are absent from the Data sheet', () => {
    const report = createEmptyReport('2026-06-18', TEST_CHECKLIST, 'Тестовый Сотрудник HR');
    report.rows.find((row) => row.id === TEST_CHECKLIST[0].id).status = 'done';
    const localReports = upsertReport({}, markReportMetricsSubmitted(report, [TEST_CHECKLIST[0]]));

    const reconciled = reconcileSubmittedMetricsWithSheetReports(localReports, {});
    const reconciledReport = getReportForDate(reconciled, '2026-06-18', TEST_CHECKLIST, 'Тестовый Сотрудник HR');

    assert.equal(isMetricSubmitted(reconciledReport, TEST_CHECKLIST[0].id), false);
    assert.deepEqual(getPendingFilledMetrics(reconciledReport, TEST_CHECKLIST).map((metric) => metric.id), [TEST_CHECKLIST[0].id]);
  });

  it('builds reports from sheet data rows and exports filled rows for the Data sheet', () => {
    const catalog = createCatalog({
      infoRows: [{ fullName: 'Мария Реальная', role: 'Контроль качества' }],
      metricSheets: [{
        name: 'Контроль качества',
        rows: [
          { frequency: 'ежедневно', metric: 'Проверить чек-листы', role: 'Контроль качества', classification: 'Проверено' },
          { frequency: 'ежедневно', metric: 'Количество ошибок', role: 'Контроль качества', classification: 'Ввод числа' },
        ],
      }],
      dataRows: [
        { date: '2026-06-01', owner: 'Мария Реальная', metric: 'Проверить чек-листы', value: 'Все ок', comment: 'Ок' },
        { date: '2026-06-01', owner: 'Мария Реальная', metric: 'Количество ошибок', value: '3', comment: 'Исправляем' },
      ],
    });
    const reports = buildReportsFromDataRows(catalog.dataRows, catalog.checklist);
    const report = getReportForDate(reports, '2026-06-01', catalog.checklist, 'Мария Реальная');

    assert.equal(getCompletion(report, catalog.checklist).done, 2);
    assert.deepEqual(buildDataRows(report, catalog.checklist), catalog.dataRows);
    assert.equal(isReportSubmittedForCategory(report, 'daily'), true);
  });



  it('maps checked answers to green, yellow and red stored values', () => {
    const catalog = createCatalog({
      infoRows: [{ fullName: 'Мария Реальная', role: 'Контроль качества' }],
      metricSheets: [{
        name: 'Контроль качества',
        rows: [{ frequency: 'ежедневно', metric: 'Проверить чек-листы', role: 'Контроль качества', classification: 'Проверено' }],
      }],
      dataRows: [
        { date: '2026-06-01', owner: 'Мария Реальная', metric: 'Проверить чек-листы', value: 'Найдены ошибки, исправлены', comment: '' },
        { date: '2026-06-02', owner: 'Мария Реальная', metric: 'Проверить чек-листы', value: 'Нельзя исправить ошибку', comment: '' },
      ],
    });

    const reports = buildReportsFromDataRows(catalog.dataRows, catalog.checklist);
    const fixedReport = getReportForDate(reports, '2026-06-01', catalog.checklist, 'Мария Реальная');
    const issueReport = getReportForDate(reports, '2026-06-02', catalog.checklist, 'Мария Реальная');

    assert.equal(fixedReport.rows[0].status, 'fixed');
    assert.equal(issueReport.rows[0].status, 'issue');
    assert.deepEqual(buildDataRows(fixedReport, catalog.checklist), [catalog.dataRows[0]]);
    assert.deepEqual(buildDataRows(issueReport, catalog.checklist), [catalog.dataRows[1]]);
  });

  it('marks a report category as submitted to block repeat sends', () => {
    const report = createEmptyReport('2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник HR');
    const submitted = markReportSubmittedForCategory(report, 'daily');

    assert.equal(isReportSubmittedForCategory(report, 'daily'), false);
    assert.equal(isReportSubmittedForCategory(submitted, 'daily'), true);
  });



  it('merges a newly submitted metric without losing earlier submitted sheet metrics', () => {
    const firstReport = createEmptyReport('2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник HR');
    const secondReport = createEmptyReport('2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник HR');
    firstReport.rows.find((row) => row.id === TEST_CHECKLIST[0].id).status = 'done';
    secondReport.rows.find((row) => row.id === TEST_CHECKLIST[1].id).comment = 'Дозаполнили позже';

    const submittedFirst = markReportMetricsSubmitted(firstReport, [TEST_CHECKLIST[0]]);
    const submittedSecond = markReportMetricsSubmitted(secondReport, [TEST_CHECKLIST[1]]);
    const merged = mergeReportFilledRows(submittedFirst, submittedSecond);

    assert.equal(isMetricSubmitted(merged, TEST_CHECKLIST[0].id), true);
    assert.equal(isMetricSubmitted(merged, TEST_CHECKLIST[1].id), true);
    assert.equal(merged.rows.find((row) => row.id === TEST_CHECKLIST[0].id).status, 'done');
    assert.equal(merged.rows.find((row) => row.id === TEST_CHECKLIST[1].id).comment, 'Дозаполнили позже');
    assert.deepEqual(
      getDueMetricsForDate(upsertReport({}, merged), '2026-06-01', 'Тестовый Сотрудник HR', TEST_CHECKLIST, { hideSubmittedForDate: true }).map((metric) => metric.id),
      [TEST_CHECKLIST[2].id],
    );
  });

  it('submits only filled metrics and lets the rest be completed later', () => {
    const report = createEmptyReport('2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник HR');
    report.rows.find((row) => row.id === TEST_CHECKLIST[0].id).status = 'done';

    const firstPendingMetrics = getPendingFilledMetrics(report, TEST_CHECKLIST);
    const afterFirstSubmit = markReportMetricsSubmitted(report, firstPendingMetrics);

    assert.deepEqual(firstPendingMetrics.map((metric) => metric.id), [TEST_CHECKLIST[0].id]);
    assert.equal(isMetricSubmitted(afterFirstSubmit, TEST_CHECKLIST[0].id), true);
    assert.equal(isMetricSubmitted(afterFirstSubmit, TEST_CHECKLIST[1].id), false);
    assert.equal(areAllMetricsSubmitted(afterFirstSubmit, TEST_CHECKLIST), false);

    afterFirstSubmit.rows.find((row) => row.id === TEST_CHECKLIST[1].id).comment = 'Дозаполнили позже';
    const nextPendingMetrics = getPendingFilledMetrics(afterFirstSubmit, TEST_CHECKLIST);

    assert.deepEqual(nextPendingMetrics.map((metric) => metric.id), [TEST_CHECKLIST[1].id]);
  });

  it('does not mark a newly filled metric as submitted just because its category was submitted before', () => {
    const report = createEmptyReport('2026-06-01', TEST_CHECKLIST, 'Тестовый Сотрудник HR');
    report.rows.find((row) => row.id === TEST_CHECKLIST[0].id).status = 'done';
    const firstPendingMetrics = getPendingFilledMetrics(report, TEST_CHECKLIST);
    const afterFirstSubmit = markReportMetricsSubmitted(report, firstPendingMetrics);
    const withLegacyCategoryFlag = markReportSubmittedForCategory(afterFirstSubmit, 'weekly');

    withLegacyCategoryFlag.rows.find((row) => row.id === TEST_CHECKLIST[1].id).status = 'fixed';
    const normalized = getReportForDate(
      upsertReport({}, withLegacyCategoryFlag),
      '2026-06-01',
      TEST_CHECKLIST,
      'Тестовый Сотрудник HR',
    );

    assert.equal(isMetricSubmitted(normalized, TEST_CHECKLIST[0].id), true);
    assert.equal(isMetricSubmitted(normalized, TEST_CHECKLIST[1].id), false);
    assert.deepEqual(getPendingFilledMetrics(normalized, TEST_CHECKLIST).map((metric) => metric.id), [TEST_CHECKLIST[1].id]);
  });

  it('keeps catalog empty when the table cannot be loaded', async () => {
    const catalog = await loadCatalog({
      dataUrl: '/missing-workbook.json',
      fetchImpl: async () => ({ ok: false, status: 404 }),
    });

    assert.deepEqual(catalog.infoRows, []);
    assert.deepEqual(catalog.checklist, []);
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
              rows: [{ frequency: 'еженедельно', metric: 'Проверить чек-листы', description: 'Описание из C', goal: 'Цель из D', role: 'Контроль качества', managerRole: 'Операционный директор' }],
            }],
          };
        },
      }),
    });

    assert.equal(catalog.infoRows[0].fullName, 'Мария Реальная');
    assert.equal(catalog.checklist[0].category, 'weekly');
    assert.equal(catalog.checklist[0].description, 'Описание из C');
    assert.equal(catalog.checklist[0].goal, 'Цель из D');
    assert.equal(catalog.checklist[0].managerRole, 'Операционный директор');
  });

  it('submits Data sheet rows to a writable endpoint', async () => {
    let request;
    const result = await submitDataRows([{ date: '2026-06-01', owner: 'Анна', metric: 'Метрика', value: 'Все ок', comment: '' }], {
      dataUrl: 'https://script.google.com/macros/s/example/exec',
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true };
      },
    });

    assert.equal(result.skipped, false);
    assert.equal(request.options.method, 'POST');
    assert.match(request.options.body, /Метрика/);
  });

  it('exports rows to csv with role, frequency and status labels', () => {
    const report = createEmptyReport('2026-06-01', TEST_CATALOG.checklist, 'Тестовый Сотрудник HR');
    report.rows[0].status = 'done';
    const csv = buildCsv(upsertReport({}, report), TEST_CATALOG);

    assert.match(csv, /Дата,ФИО,Роль,Периодичность,Лист/);
    assert.match(csv, /Тестовый Сотрудник HR,HR,Ежедневно,HR/);
    assert.match(csv, /Все ок/);
  });

  it('does not export a default status for unanswered legacy rows', () => {
    const reports = {
      [makeReportKey('2026-06-01', 'Тестовый Сотрудник HR')]: {
        date: '2026-06-01',
        owner: 'Тестовый Сотрудник HR',
        rows: [{ id: TEST_CATALOG.checklist[0].id, status: 'skipped', value: '', comment: '', updatedAt: '' }],
      },
    };
    const report = getReportForDate(reports, '2026-06-01', TEST_CATALOG.checklist, 'Тестовый Сотрудник HR');
    const csv = buildCsv(upsertReport({}, report), TEST_CATALOG);

    assert.equal(report.rows[0].status, '');
    assert.doesNotMatch(csv, /skipped|Не проверено/);
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
    assert.match(indexHtml, /class="is-loading"/);
    assert.match(indexHtml, /id="loading-screen"/);
  });
});
