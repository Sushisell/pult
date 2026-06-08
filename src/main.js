import { CATEGORIES, INFO_ROWS, CHECKLIST, STATUS, findEmployeeByFullName, getMetricsForRole, groupMetricsByFrequency } from './checklist.js';
import { loadCatalog, submitDataRows } from './data-source.js';
import { APP_VERSION } from './version.js';
import {
  buildCsv,
  buildDataRows,
  buildReportsFromDataRows,
  buildSummaryRows,
  getCompletion,
  getDueMetricsForDate,
  getReportForDate,
  isMetricFilled,
  isReportSubmittedForCategory,
  loadReports,
  markReportSubmittedForCategory,
  mergeReports,
  saveReports,
  todayISO,
  upsertReport,
} from './storage.js';

const state = {
  reports: loadReports(),
  date: todayISO(),
  frequencyFilter: 'all',
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
  dateError: document.querySelector('#date-error'),
  saveDailyButton: document.querySelector('#save-daily-button'),
  saveWeeklyButton: document.querySelector('#save-weekly-button'),
  saveFeedback: document.querySelector('#save-feedback'),
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
  managerDashboard: document.querySelector('#manager-dashboard'),
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
  const roleMetrics = employee ? getMetricsForRole(employee.role, state.catalog.checklist) : [];
  const dueMetrics = employee ? getDueMetricsForDate(state.reports, state.date, employee.fullName, roleMetrics) : [];
  const metrics = state.frequencyFilter === 'all'
    ? dueMetrics
    : dueMetrics.filter((metric) => metric.category === state.frequencyFilter);
  return {
    employee,
    roleMetrics,
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
  updateSaveButtons();
  updateSubmittedFeedback();
  renderTabs();
  renderChecklist(context);
  renderSummary();
  renderManagerDashboard(context.employee);
}

function renderTabs() {
  elements.tabs.innerHTML = '';
  elements.tabs.removeAttribute('aria-hidden');
  elements.tabs.classList.remove('visually-hidden');

  const options = [
    { id: 'all', label: 'Все актуальные' },
    ...CATEGORIES,
  ];

  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'frequency-filter';
    button.textContent = option.label;
    button.setAttribute('aria-pressed', String(state.frequencyFilter === option.id));
    button.addEventListener('click', () => {
      state.frequencyFilter = option.id;
      render();
    });
    elements.tabs.append(button);
  }
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

  const visibleCount = groups.reduce((total, group) => total + group.items.length, 0);
  elements.activeCategoryTitle.textContent = `Метрики для должности: ${employee.role}`;
  elements.activeCategoryCount.textContent = `${visibleCount} показателей`;

  if (visibleCount === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Для выбранной частоты нет актуальных метрик: еженедельные и ежемесячные скрываются, если уже заполнялись в текущем периоде.';
    elements.checklistBody.append(empty);
    return;
  }

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
  wrapper.append(title);

  if (item.description) {
    const description = document.createElement('span');
    description.className = 'metric-format';
    description.textContent = item.description;
    wrapper.append(description);
  }

  if (item.goal) {
    const goal = document.createElement('span');
    goal.className = 'metric-goal';
    goal.textContent = `Цель: ${item.goal}`;
    wrapper.append(goal);
  }

  return wrapper;
}

function createControlCell(item, row) {
  const wrapper = document.createElement('div');
  wrapper.className = 'control-stack';

  if (item.type === 'number') {
    const inlineField = document.createElement('div');
    inlineField.className = 'inline-field';
    const input = document.createElement('input');
    input.type = 'number';
    input.value = row.value;
    input.placeholder = item.placeholder ?? '0';
    input.disabled = isMetricLocked(item.category);
    input.addEventListener('input', (event) => updateRow(item.id, { value: event.target.value }));
    const suffix = document.createElement('span');
    suffix.textContent = item.suffix;
    inlineField.append(input, suffix);
    wrapper.append(inlineField, createCommentField(item, row));
    return wrapper;
  }

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
    input.disabled = isMetricLocked(item.category);
    input.addEventListener('change', () => updateRow(item.id, { status: value }));
    const text = document.createElement('span');
    text.textContent = label;
    option.append(input, text);
    group.append(option);
  }

  wrapper.append(group, createCommentField(item, row));
  return wrapper;
}

function createCommentField(item, row) {
  const textarea = document.createElement('textarea');
  textarea.className = 'metric-comment';
  textarea.placeholder = item.placeholder ?? 'Комментарий к метрике';
  textarea.value = row.comment;
  textarea.disabled = isMetricLocked(item.category);
  textarea.addEventListener('input', (event) => updateRow(item.id, { comment: event.target.value }));
  return textarea;
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


function renderManagerDashboard(employee) {
  if (!elements.managerDashboard) return;
  elements.managerDashboard.innerHTML = '';

  if (!employee) {
    elements.managerDashboard.hidden = true;
    return;
  }

  const team = getManagedEmployees(employee);
  if (team.length === 0) {
    elements.managerDashboard.hidden = true;
    return;
  }

  elements.managerDashboard.hidden = false;
  const title = document.createElement('h2');
  title.textContent = `Дашборд руководителя: ${employee.role}`;
  const note = document.createElement('p');
  note.className = 'manager-note';
  note.textContent = 'Статус заполнения сотрудников за выбранную дату. Еженедельные и ежемесячные метрики учитываются только если они актуальны в текущем периоде.';
  const list = document.createElement('div');
  list.className = 'manager-list';

  for (const teammate of team) {
    const metrics = getMetricsForRole(teammate.role, state.catalog.checklist);
    const dueMetrics = getDueMetricsForDate(state.reports, state.date, teammate.fullName, metrics);
    const report = getReportForDate(state.reports, state.date, state.catalog.checklist, teammate.fullName);
    const completion = getCompletion(report, dueMetrics);
    const filledAny = dueMetrics.some((metric) => isMetricFilled(report, metric.id));
    const card = document.createElement('article');
    card.className = 'manager-card';
    card.innerHTML = `
      <div>
        <strong>${escapeHtml(teammate.fullName)}</strong>
        <span>${escapeHtml(teammate.role)}</span>
      </div>
      <div class="manager-status">
        <b>${completion.percent}%</b>
        <span>${filledAny ? 'Заполнялось' : 'Не заполнено'} · ${completion.done}/${completion.total}</span>
      </div>
    `;
    card.append(createManagerMetricList(dueMetrics, report));
    list.append(card);
  }

  elements.managerDashboard.append(title, note, list);
}

function createManagerMetricList(metrics, report) {
  const list = document.createElement('ul');
  list.className = 'manager-metric-list';

  for (const metric of metrics) {
    const filled = isMetricFilled(report, metric.id);
    const row = report.rows.find((entry) => entry.id === metric.id);
    const item = document.createElement('li');
    const status = row?.status ?? 'skipped';
    item.className = filled ? `is-filled is-${status}` : 'is-empty';
    const detail = getManagerMetricDetail(row, metric, filled);
    item.innerHTML = `
      <span>${status === 'issue' ? '!' : filled ? '✓' : '○'}</span>
      <div>
        <strong>${escapeHtml(metric.metric)}</strong>
        <small>${escapeHtml(detail)}</small>
      </div>
    `;
    list.append(item);
  }

  return list;
}

function getManagerMetricDetail(row, metric, filled) {
  if (!filled) return 'Не заполнено';

  const status = row?.status ?? 'skipped';
  const value = String(row?.value ?? '').trim();
  const comment = String(row?.comment ?? '').trim();
  const parts = [];

  if (metric.type === 'number') {
    parts.push(value ? `Результат: ${value}${metric.suffix ? ` ${metric.suffix}` : ''}` : 'Результат заполнен');
  } else {
    parts.push(STATUS[status] ?? 'Заполнено');
    if (value) parts.push(`Результат: ${value}`);
  }

  if (comment) parts.push(`Комментарий: ${comment}`);
  return parts.join(' · ');
}

function getManagedEmployees(manager) {
  const normalizedManagerRole = normalizeText(manager.role);
  return state.catalog.infoRows.filter((employee) => {
    if (employee.fullName === manager.fullName) return false;
    const employeeMetrics = getMetricsForRole(employee.role, state.catalog.checklist);
    const reportsToManager = employeeMetrics.some((metric) => normalizeText(metric.managerRole) === normalizedManagerRole);
    return reportsToManager || normalizeText(employee.managerRole) === normalizedManagerRole;
  });
}

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
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
  const nextDate = event.target.value;
  if (!setReportDate(nextDate)) event.target.value = state.date;
});


function setReportDate(nextDate) {
  if (!nextDate) return false;
  const today = todayISO();
  if (nextDate > today) {
    const message = 'Ай-ай-ай... хочешь заполнить отчёт раньше времени? Атата! Выбери сегодня или любую прошедшую дату.';
    elements.dateError.textContent = message;
    elements.dateError.hidden = false;
    elements.dateInput.setCustomValidity(message);
    elements.dateInput.reportValidity();
    return false;
  }

  elements.dateError.hidden = true;
  elements.dateInput.setCustomValidity('');
  state.date = nextDate;
  state.report = getReportForDate(state.reports, state.date, state.catalog.checklist, state.report.owner || getDefaultOwner());
  render();
  return true;
}

async function saveFrequencyReport(category) {
  if (isReportSubmittedForCategory(state.report, category)) {
    showAlreadySubmittedMessage(category);
    updateSaveButtons();
    return;
  }

  persist(markReportSubmittedForCategory(state.report, category));
  const label = category === 'weekly' ? 'Еженедельный' : 'Ежедневный';
  const metrics = getOwnerContext().roleMetrics.filter((metric) => metric.category === category);
  const dataRows = buildDataRows(state.report, metrics);

  try {
    const result = await submitDataRows(dataRows);
    const remoteNote = result.skipped ? '' : ' Данные отправлены на лист «Данные».';
    elements.saveFeedback.textContent = `${label} отчёт сохранён за ${state.date}.${remoteNote}`;
  } catch (error) {
    console.warn('Не удалось отправить данные в таблицу.', error);
    elements.saveFeedback.textContent = `${label} отчёт сохранён локально за ${state.date}, но таблица «Данные» не обновилась.`;
  }
}

function isMetricLocked(category) {
  return isReportSubmittedForCategory(state.report, category);
}

function updateSaveButtons() {
  updateSaveButton(elements.saveDailyButton, 'daily');
  updateSaveButton(elements.saveWeeklyButton, 'weekly');
}

function updateSaveButton(button, category) {
  if (!button) return;
  const submitted = isReportSubmittedForCategory(state.report, category);
  button.disabled = submitted;
  button.title = submitted ? 'Данные уже заполнены за выбранный день' : '';
  button.setAttribute('aria-disabled', String(submitted));
}

function updateSubmittedFeedback() {
  const submittedLabels = [
    ['daily', 'Ежедневные'],
    ['weekly', 'Еженедельные'],
  ]
    .filter(([category]) => isReportSubmittedForCategory(state.report, category))
    .map(([, label]) => label.toLowerCase());

  if (submittedLabels.length === 0) {
    elements.saveFeedback.textContent = '';
    return;
  }

  elements.saveFeedback.textContent = `${submittedLabels.join(' и ')} данные уже заполнены за ${state.date}. Повторно отправить отчёт нельзя.`;
}

function showAlreadySubmittedMessage(category) {
  const label = category === 'weekly' ? 'Еженедельные' : 'Ежедневные';
  elements.saveFeedback.textContent = `${label} данные уже заполнены за ${state.date}. Повторно отправить отчёт нельзя.`;
}

elements.ownerInput.addEventListener('change', (event) => {
  state.report = getReportForDate(state.reports, state.date, state.catalog.checklist, event.target.value);
  render();
});
elements.saveDailyButton.addEventListener('click', () => saveFrequencyReport('daily'));
elements.saveWeeklyButton.addEventListener('click', () => saveFrequencyReport('weekly'));
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
  const sheetReports = buildReportsFromDataRows(state.catalog.dataRows, state.catalog.checklist);
  state.reports = mergeReports(sheetReports, state.reports);
  saveReports(state.reports);
  const defaultOwner = getDefaultOwner();
  const selectedOwner = state.report?.owner || defaultOwner;
  state.report = getReportForDate(state.reports, state.date, state.catalog.checklist, selectedOwner);
  if (!state.report.owner && defaultOwner) state.report.owner = defaultOwner;
  refreshOwnerOptions();
  render();
}

refreshOwnerOptions();
render();
hydrateCatalog();
