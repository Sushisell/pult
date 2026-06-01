import { CHECKLIST, STATUS } from './checklist.js';
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
};

const elements = {
  dateInput: document.querySelector('#date-input'),
  ownerInput: document.querySelector('#owner-input'),
  saveButton: document.querySelector('#save-button'),
  exportButton: document.querySelector('#export-button'),
  checklistBody: document.querySelector('#checklist-body'),
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
  renderChecklist();
  renderSummary();
}

function renderChecklist() {
  elements.checklistBody.innerHTML = '';
  for (const item of CHECKLIST) {
    const row = state.report.rows.find((entry) => entry.id === item.id);
    const tableRow = document.createElement('tr');
    if (row.status === 'issue') tableRow.classList.add('has-issue');

    tableRow.append(
      createCell(String(item.id), 'number-cell'),
      createCell(item.metric),
      createCell(item.reportFormat),
      createStatusCell(item, row),
      createValueCell(item, row),
    );
    elements.checklistBody.append(tableRow);
  }
}

function createCell(text, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
}

function createStatusCell(item, row) {
  const cell = document.createElement('td');
  const select = document.createElement('select');
  for (const [value, label] of Object.entries(STATUS)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = row.status;
  select.addEventListener('change', (event) => updateRow(item.id, { status: event.target.value }));
  cell.append(select);
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
        <span>⚠ ${report.completion.issues} проблем</span>
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
