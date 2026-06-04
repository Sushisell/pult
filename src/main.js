import { CATEGORIES, CHECKLIST, STATUS } from './checklist.js';
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
  activeCategory: CATEGORIES[0].id,
};

const elements = {
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

state.report = getReportForDate(state.reports, state.date);
elements.dateInput.value = state.date;

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
  const csv = buildCsv(upsertReport(state.reports, state.report));
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pult-checks-${state.date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function render() {
  const completion = getCompletion(state.report);
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
  renderChecklist();
  renderSummary();
}

function renderTabs() {
  elements.tabs.innerHTML = '';
  for (const category of CATEGORIES) {
    const completion = getCategoryCompletion(category.id);
    const button = document.createElement('button');
    button.className = 'tab-button';
    button.type = 'button';
    const isActive = category.id === state.activeCategory;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(isActive));
    button.setAttribute('aria-pressed', String(isActive));
    button.innerHTML = `
      <span class="tab-label"><span class="tab-dot" aria-hidden="true"></span>${category.icon} ${category.label}</span>
      <b>${completion.done}/${completion.total}</b>
    `;
    button.addEventListener('click', () => {
      state.activeCategory = category.id;
      render();
    });
    elements.tabs.append(button);
  }
}

function renderChecklist() {
  elements.checklistBody.innerHTML = '';
  const category = CATEGORIES.find((entry) => entry.id === state.activeCategory) ?? CATEGORIES[0];
  const items = CHECKLIST.filter((item) => item.category === category.id);
  const completion = getCategoryCompletion(category.id);

  elements.activeCategoryTitle.textContent = `${category.icon} ${category.label}`;
  elements.activeCategoryCount.textContent = `${completion.done} из ${completion.total} проверено`;

  for (const [index, item] of items.entries()) {
    const row = state.report.rows.find((entry) => entry.id === item.id);
    const tableRow = document.createElement('tr');
    if (row.status === 'done') tableRow.classList.add('is-done');

    tableRow.append(
      createCell(String(index + 1), 'number-cell'),
      createMetricCell(item),
      createStatusCell(item, row),
      createValueCell(item, row),
    );
    elements.checklistBody.append(tableRow);
  }
}

function getCategoryCompletion(categoryId) {
  const itemIds = CHECKLIST.filter((item) => item.category === categoryId).map((item) => item.id);
  const rows = state.report.rows.filter((row) => itemIds.includes(row.id));
  const done = rows.filter((row) => row.status === 'done').length;
  return {
    total: rows.length,
    done,
    percent: rows.length === 0 ? 0 : Math.round((done / rows.length) * 100),
  };
}

function createMetricCell(item) {
  const cell = document.createElement('td');
  const title = document.createElement('strong');
  title.textContent = item.metric;
  const format = document.createElement('span');
  format.className = 'metric-format';
  format.textContent = item.reportFormat;
  cell.append(title, format);
  return cell;
}

function createCell(text, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
}

function createStatusCell(item, row) {
  const cell = document.createElement('td');
  const group = document.createElement('div');
  group.className = 'status-toggle';

  for (const [value, label] of Object.entries(STATUS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'status-pill';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(row.status === value));
    button.addEventListener('click', () => updateRow(item.id, { status: value }));
    group.append(button);
  }

  cell.append(group);
  return cell;
}

function createValueCell(item, row) {
  const cell = document.createElement('td');

  if (item.type === 'number') {
    const wrapper = document.createElement('div');
    wrapper.className = 'inline-field';
    const input = document.createElement('input');
    input.type = 'number';
    input.value = row.value;
    input.placeholder = item.placeholder;
    input.addEventListener('input', (event) => updateRow(item.id, { value: event.target.value }));
    const suffix = document.createElement('span');
    suffix.textContent = item.suffix;
    wrapper.append(input, suffix);
    cell.append(wrapper);
    return cell;
  }

  const textarea = document.createElement('textarea');
  textarea.value = row.comment;
  textarea.placeholder = item.placeholder || 'Комментарий, если есть отклонение';
  textarea.addEventListener('input', (event) => updateRow(item.id, { comment: event.target.value }));
  cell.append(textarea);
  return cell;
}

function renderSummary() {
  const summaryRows = buildSummaryRows(state.reports);
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
  state.report = getReportForDate(state.reports, state.date);
  render();
});

elements.ownerInput.addEventListener('input', (event) => updateReport({ owner: event.target.value }));
elements.saveButton.addEventListener('click', () => persist(state.report));
elements.exportButton.addEventListener('click', exportCsv);

render();
