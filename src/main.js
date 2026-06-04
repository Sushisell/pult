import { INFO_ROWS, CHECKLIST, STATUS, findEmployeeByFullName, getMetricsForRole, groupMetricsByFrequency } from './checklist.js';
import { loadCatalog } from './data-source.js';
import { APP_VERSION } from './version.js';
import {
  buildCsv,
  buildSummaryRows,
  getCompletion,
  getReportForDate,
  loadReports,
  saveReports,
  todayISO,
  upsertReport,
} from './storage.js';

const state = {
  reports: loadReports(),
  date: todayISO(),
  report: null,
  catalog: {
    infoRows: INFO_ROWS,
    checklist: CHECKLIST,
  },
};

const elements = {
  appVersion: document.querySelector('#app-version'),
  dateInput: document.querySelector('#date-input'),
  ownerInput: document.querySelector('#owner-input'),
  saveButton: document.querySelector('#save-button'),
  exportButton: document.querySelector('#export-button'),
  tabs: document.querySelector('#category-tabs'),
  checklistBody: document.querySelector('#checklist-body'),
  activeCategoryTitle: document.querySelector('#active-category-title'),
  activeCategoryCount: document.querySelector('#active-category-count'),
  summaryList: document.querySelector('#summary-list'),
  heroScore: document.querySelector('#hero-score'),
  doneCount: document.querySelector('#done-count'),
  issueCount: document.querySelector('#issue-count'),
  skippedCount: document.querySelector('#skipped-count'),
};

state.report = getReportForDate(state.reports, state.date, state.catalog.checklist, getDefaultOwner());
elements.dateInput.value = state.date;
if (elements.appVersion) elements.appVersion.textContent = `v${APP_VERSION}`;

function ensureOwnerOption(owner) {
  if (!owner || !elements.ownerInput) return;
  if (Array.from(elements.ownerInput.options).some((option) => option.value === owner)) return;
  const option = document.createElement('option');
  option.value = owner;
  option.textContent = owner;
  elements.ownerInput.append(option);
}

function persist(nextReport) {
  state.report = nextReport;
  state.reports = upsertReport(state.reports, nextReport);
  saveReports(state.reports);
  render();
}

function updateReport(patch) {
  persist({ ...state.report, ...patch });
}

function updateRow(id, patch) {
  const updatedAt = new Date().toLocaleString('ru-RU');
  persist({
    ...state.report,
    rows: state.report.rows.map((row) => (row.id === id ? { ...row, ...patch, updatedAt } : row)),
  });
}

function exportCsv() {
  const csv = buildCsv(upsertReport(state.reports, state.report), state.catalog);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pult-checks-${state.date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function getOwnerContext() {
  const employee = findEmployeeByFullName(state.report.owner, state.catalog.infoRows);
  const metrics = employee ? getMetricsForRole(employee.role, state.catalog.checklist) : [];
  return {
    employee,
    metrics,
    groups: groupMetricsByFrequency(metrics),
  };
}

function render() {
  const context = getOwnerContext();
  const completion = getCompletion(state.report, context.metrics);
  ensureOwnerOption(state.report.owner);
  elements.ownerInput.value = state.report.owner;
  elements.heroScore.setAttribute('aria-label', `Выполнено ${completion.percent}%`);
  elements.heroScore.innerHTML = `
    <span class="score-icon">✓</span>
    <strong>${completion.percent}%</strong>
    <span>${completion.done} из ${completion.total} проверено</span>
  `;
  elements.doneCount.textContent = completion.done;
  elements.issueCount.textContent = completion.issues;
  elements.skippedCount.textContent = completion.skipped;
  renderTabs();
  renderChecklist(context);
  renderSummary();
}

function renderTabs() {
  elements.tabs.innerHTML = '';
}

function renderChecklist({ employee, groups }) {
  elements.checklistBody.innerHTML = '';

  if (!employee) {
    elements.activeCategoryTitle.textContent = 'Метрики не найдены';
    elements.activeCategoryCount.textContent = '0 из 0 проверено';
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Введите ФИО как на листе «Инфо», чтобы определить роль и показать подходящие метрики.';
    elements.checklistBody.append(empty);
    return;
  }

  elements.activeCategoryTitle.textContent = `Метрики для роли: ${employee.role}`;
  elements.activeCategoryCount.textContent = `${groups.reduce((total, group) => total + group.items.length, 0)} показателей`;

  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'frequency-group';
    const heading = document.createElement('h3');
    heading.textContent = group.label;
    section.append(heading);

    for (const item of group.items) {
      const row = state.report.rows.find((entry) => entry.id === item.id);
      section.append(createChecklistCard(item, row));
    }

    elements.checklistBody.append(section);
  }
}

function createChecklistCard(item, row) {
  const card = document.createElement('article');
  card.className = 'check-row';
  if (row.status === 'done') card.classList.add('is-done');
  if (row.status === 'issue') card.classList.add('is-issue');
  if (item.type === 'number') card.classList.add('is-number');

  card.append(createMetricCell(item), createControlCell(item, row));
  return card;
}

function createMetricCell(item) {
  const wrapper = document.createElement('div');
  const title = document.createElement('strong');
  title.className = 'metric-title';
  title.textContent = item.metric;
  const format = document.createElement('span');
  format.className = 'metric-format';
  format.textContent = item.reportFormat;
  const source = document.createElement('span');
  source.className = 'metric-source';
  source.textContent = `Лист: ${item.sourceSheet}, колонка B · роль из колонки I: ${item.role}`;
  wrapper.append(title, format, source);
  return wrapper;
}

function createControlCell(item, row) {
  if (item.type === 'number') {
    const wrapper = document.createElement('div');
    wrapper.className = 'inline-field';
    const input = document.createElement('input');
    input.type = 'number';
    input.value = row.value;
    input.placeholder = item.placeholder ?? '0';
    input.addEventListener('input', (event) => updateRow(item.id, { value: event.target.value }));
    const suffix = document.createElement('span');
    suffix.textContent = item.suffix;
    wrapper.append(input, suffix);
    return wrapper;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'control-stack';
  const group = document.createElement('div');
  group.className = 'status-toggle';

  for (const [value, label] of Object.entries(STATUS)) {
    const option = document.createElement('label');
    option.className = `status-option is-${value}`;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `status-${item.id}`;
    input.value = value;
    input.checked = row.status === value;
    input.addEventListener('change', () => updateRow(item.id, { status: value }));
    const text = document.createElement('span');
    text.textContent = label;
    option.append(input, text);
    group.append(option);
  }

  wrapper.append(group);

  if (item.type === 'checkboxWithText') {
    const textarea = document.createElement('textarea');
    textarea.placeholder = item.placeholder ?? 'Комментарий';
    textarea.value = row.comment;
    textarea.addEventListener('input', (event) => updateRow(item.id, { comment: event.target.value }));
    wrapper.append(textarea);
  }

  return wrapper;
}

function renderSummary() {
  const summaryRows = buildSummaryRows(state.reports, state.catalog);
  elements.summaryList.innerHTML = '';

  if (summaryRows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Пока нет сохранённых проверок.';
    elements.summaryList.append(empty);
    return;
  }

  for (const report of summaryRows) {
    const card = document.createElement('article');
    card.className = 'summary-card';
    card.innerHTML = `
      <div>
        <strong>${escapeHtml(report.date)}</strong>
        <span>${escapeHtml(report.owner || 'Ответственный не указан')}</span>
      </div>
      <div class="summary-metrics">
        <span>✓ ${report.completion.done} проверено</span>
        <span>💬 ${report.completion.issues} комментариев</span>
        <b>${report.completion.percent}%</b>
      </div>
    `;
    elements.summaryList.append(card);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

elements.dateInput.addEventListener('change', (event) => {
  state.date = event.target.value;
  state.report = getReportForDate(state.reports, state.date, state.catalog.checklist, getDefaultOwner());
  render();
});

elements.ownerInput.addEventListener('change', (event) => updateReport({ owner: event.target.value }));
elements.saveButton.addEventListener('click', () => persist(state.report));
elements.exportButton.addEventListener('click', exportCsv);

function getDefaultOwner() {
  return state.catalog.infoRows[0]?.fullName ?? '';
}

function refreshOwnerOptions() {
  elements.ownerInput.innerHTML = '';
  for (const employee of state.catalog.infoRows) ensureOwnerOption(employee.fullName);
  ensureOwnerOption(state.report.owner);
}

async function hydrateCatalog() {
  state.catalog = await loadCatalog();
  const hasSavedReport = Boolean(state.reports[state.date]);
  state.report = getReportForDate(state.reports, state.date, state.catalog.checklist, getDefaultOwner());
  if (!hasSavedReport && getDefaultOwner()) state.report.owner = getDefaultOwner();
  refreshOwnerOptions();
  render();
}

refreshOwnerOptions();
render();
hydrateCatalog();
