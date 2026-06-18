import { CATEGORIES, INFO_ROWS, CHECKLIST, STATUS, findEmployeeByFullName, getMetricsForRole, groupMetricsByFrequency } from './checklist.js?v=0.1.6';
import { loadCatalog, submitDataRows } from './data-source.js?v=0.1.6';
import { APP_VERSION } from './version.js?v=0.1.6';
import {
  buildCsv,
  buildDataRows,
  buildReportsFromDataRows,
  buildSummaryRows,
  createEmptyReport,
  getCompletion,
  getDueMetricsForDate,
  getReportForDate,
  areAllMetricsSubmitted,
  getPendingFilledMetrics,
  isMetricFilled,
  isMetricSubmitted,
  loadReports,
  markReportMetricsSubmitted,
  mergeReports,
  saveReports,
  todayISO,
  upsertReport,
} from './storage.js?v=0.1.6';

const state = {
  localReports: loadReports(),
  sheetReports: {},
  reports: {},
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
  loadingScreen: document.querySelector('#loading-screen'),
  dateInput: document.querySelector('#date-input'),
  ownerInput: document.querySelector('#owner-input'),
  dateError: document.querySelector('#date-error'),
  saveReportButton: document.querySelector('#save-report-button'),
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

state.reports = { ...state.localReports };
state.report = createEditableReport(state.date, getDefaultOwner());
elements.dateInput.value = state.date;
if (elements.appVersion) elements.appVersion.textContent = `v${APP_VERSION}`;

function appendOwnerOption(owner) {
  if (!owner || !elements.ownerInput) return;
  const option = document.createElement('option');
  option.value = owner;
  option.textContent = owner;
  elements.ownerInput.append(option);
}

function persist(nextReport, { shouldRender = true } = {}) {
  state.report = nextReport;
  state.localReports = upsertReport(state.localReports, nextReport);
  state.reports = upsertReport(state.reports, nextReport);
  saveReports(state.localReports);
  if (shouldRender) render();
}

function updateReport(patch) {
  persist({ ...state.report, ...patch });
}

function updateRow(id, patch, options = {}) {
  const updatedAt = new Date().toLocaleString('ru-RU');
  persist({
    ...state.report,
    rows: state.report.rows.map((row) => (row.id === id ? { ...row, ...patch, updatedAt } : row)),
  }, options);
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
  const dueMetrics = employee ? getDueMetricsForDate(state.reports, state.date, employee.fullName, roleMetrics, { hideSubmittedForDate: true }) : [];
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
  elements.ownerInput.value = hasCatalogOwner(state.report.owner) ? state.report.owner : '';
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
    empty.textContent = 'Данные из таблицы не загружены или выбранного ФИО нет на листе «Инфо». Проверьте публикацию таблицы и URL веб-приложения.';
    elements.checklistBody.append(empty);
    return;
  }

  const visibleCount = groups.reduce((total, group) => total + group.items.length, 0);
  elements.activeCategoryTitle.textContent = `Метрики для должности: ${employee.role}`;
  elements.activeCategoryCount.textContent = `${visibleCount} показателей`;

  if (visibleCount === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Для выбранной частоты нет актуальных метрик: уже заполненные метрики скрываются.';
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
  if (row.status === 'fixed') card.classList.add('is-fixed');
  if (row.status === 'issue') card.classList.add('is-issue');
  if (item.type === 'number') card.classList.add('is-number');
  if (isMetricLocked(item)) card.classList.add('is-locked');
  if (isMetricDeadlineExpired(item)) card.classList.add('is-deadline-expired');

  card.append(createMetricCell(item, row), createControlCell(item, row));
  return card;
}

function createMetricCell(item, row) {
  const wrapper = document.createElement('div');
  const title = document.createElement('strong');
  title.className = 'metric-title';
  title.textContent = item.metric;
  wrapper.append(title);

  if (item.description) {
    const description = document.createElement('span');
    description.className = 'metric-format metric-description';
    appendTextWithLinks(description, `Описание: ${item.description}`);
    if (item.goal) {
      const divider = document.createElement('span');
      divider.className = 'metric-divider';
      divider.setAttribute('aria-hidden', 'true');
      description.append(divider);
    }
    wrapper.append(description);
  }

  if (item.goal) {
    const goal = document.createElement('span');
    goal.className = 'metric-goal';
    goal.textContent = `Цель: ${item.goal}`;
    wrapper.append(goal);
  }

  const meta = createMetricMeta(item, row);
  if (meta) wrapper.append(meta);

  return wrapper;
}

function createMetricMeta(item, row) {
  const badges = [];
  if (item.deadline) {
    badges.push({
      label: isMetricDeadlineExpired(item) ? `Срок истёк: ${item.deadline}` : `Срок: ${item.deadline}`,
      className: isMetricDeadlineExpired(item) ? 'metric-badge metric-badge-danger' : 'metric-badge',
    });
  }
  if (isMetricSubmitted(state.report, item.id)) badges.push({ label: 'Уже сохранено', className: 'metric-badge metric-badge-success' });
  if (badges.length === 0) return null;

  const meta = document.createElement('div');
  meta.className = 'metric-meta';
  for (const badge of badges) {
    const span = document.createElement('span');
    span.className = badge.className;
    span.textContent = badge.label;
    meta.append(span);
  }
  return meta;
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
    input.disabled = isMetricLocked(item);
    input.addEventListener('input', (event) => updateRow(item.id, { value: event.target.value }, { shouldRender: false }));
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
    if (input.checked) option.classList.add('is-selected');
    input.disabled = isMetricLocked(item);
    if (input.disabled) option.classList.add('is-disabled');
    input.addEventListener('change', () => updateRow(item.id, { status: value }));
    option.addEventListener('click', (event) => {
      if (input.disabled || input.checked) return;
      event.preventDefault();
      updateRow(item.id, { status: value });
    });
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
  textarea.disabled = isMetricLocked(item);
  textarea.addEventListener('input', (event) => updateRow(item.id, { comment: event.target.value }, { shouldRender: false }));
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
    const dueMetrics = getDueMetricsForDate(state.sheetReports, state.date, teammate.fullName, metrics);
    const report = getReportForDate(state.sheetReports, state.date, state.catalog.checklist, teammate.fullName);
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
    const status = row?.status ?? '';
    item.className = filled && status ? `is-filled is-${status}` : filled ? 'is-filled' : 'is-empty';
    const detail = getManagerMetricDetail(row, metric, filled);
    const deadline = getManagerMetricDeadline(metric);
    const icon = status === 'issue' ? '!' : status === 'fixed' ? '✓!' : filled ? '✓' : '○';
    item.innerHTML = `
      <span>${icon}</span>
      <div>
        <strong>${escapeHtml(metric.metric)}</strong>
        ${deadline ? `<small class="manager-deadline">${escapeHtml(deadline)}</small>` : ''}
        <small>${escapeHtml(detail)}</small>
      </div>
    `;
    list.append(item);
  }

  return list;
}

function getManagerMetricDeadline(metric) {
  const deadline = String(metric.deadline ?? '').trim();
  return deadline ? `Срок сдачи: ${deadline}` : '';
}

function getManagerMetricDetail(row, metric, filled) {
  if (!filled) return 'Не заполнено';

  const status = row?.status ?? '';
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

function appendTextWithLinks(parent, value) {
  const text = String(value ?? '');
  const urlPattern = /https?:\/\/[^\s<>()]+[^\s<>().,!?:;\]}'"]/giu;
  let lastIndex = 0;

  for (const match of text.matchAll(urlPattern)) {
    if (match.index > lastIndex) {
      parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const link = document.createElement('a');
    link.href = match[0];
    link.textContent = match[0];
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    parent.append(link);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parent.append(document.createTextNode(text.slice(lastIndex)));
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
  const selectedOwner = hasCatalogOwner(state.report.owner) ? state.report.owner : getDefaultOwner();
  state.report = createEditableReport(state.date, selectedOwner);
  render();
  return true;
}

async function saveReport() {
  const context = getOwnerContext();
  const metrics = context.roleMetrics;
  if (!context.employee || metrics.length === 0) {
    elements.saveFeedback.textContent = 'Нечего сохранять: данные из таблицы не загружены или для выбранного ФИО нет метрик.';
    updateSaveButtons();
    return;
  }

  const pendingMetrics = getPendingFilledMetrics(state.report, metrics);

  if (pendingMetrics.length === 0) {
    elements.saveFeedback.textContent = areAllMetricsSubmitted(state.report, metrics)
      ? `Отчёт уже полностью сохранён за ${state.date}.`
      : 'Заполните хотя бы одну новую метрику, чтобы сохранить отчёт. Остальные можно дозаполнить позже.';
    updateSaveButtons();
    return;
  }

  const dataRows = buildDataRows(state.report, pendingMetrics);

  try {
    const result = await submitDataRows(dataRows);
    persist(markReportMetricsSubmitted(state.report, pendingMetrics));
    const remoteNote = result.skipped ? '' : ' Данные отправлены на лист «Данные».';
    const leftCount = metrics.length - getCompletion(state.report, metrics).done;
    const laterNote = leftCount > 0 ? ` Осталось ${leftCount}; их можно дозаполнить позже.` : '';
    elements.saveFeedback.textContent = `Отчёт сохранён за ${state.date}: ${pendingMetrics.length} метрик.${remoteNote}${laterNote}`;
  } catch (error) {
    console.warn('Не удалось отправить данные в таблицу.', error);
    elements.saveFeedback.textContent = `Отчёт сохранён локально за ${state.date}, но таблица «Данные» не обновилась. Можно повторить сохранение позже.`;
  }
}

function isMetricLocked(item) {
  return isMetricSubmitted(state.report, item.id);
}

function isMetricDeadlineExpired(item, now = new Date()) {
  const deadlineAt = getMetricDeadlineDate(item.deadline, state.date);
  if (!deadlineAt) return false;
  return now.getTime() > deadlineAt.getTime();
}

function getMetricDeadlineDate(deadline, reportDate) {
  const value = normalizeText(deadline).replaceAll('ё', 'е');
  if (!value || !reportDate) return null;

  const timeMatch = value.match(/^(\d{1,2})(?::(\d{2}))?$/u);
  if (timeMatch) return createKrasnoyarskDate(reportDate, Number(timeMatch[1]), Number(timeMatch[2] ?? 0));

  const krasnoyarskTimeMatch = value.match(/(?:^|\s|к\s*)(\d{1,2})(?::(\d{2}))?\s*(?:по\s*)?(?:крск|красноярск\w*)/u);
  if (krasnoyarskTimeMatch) {
    return createKrasnoyarskDate(reportDate, Number(krasnoyarskTimeMatch[1]), Number(krasnoyarskTimeMatch[2] ?? 0));
  }

  const weekdayIndex = getWeekdayIndex(value);
  if (weekdayIndex !== null) {
    const [year, month, dayOfMonth] = reportDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
    const day = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    date.setUTCDate(date.getUTCDate() + weekdayIndex - day);
    return createKrasnoyarskDate(date.toISOString().slice(0, 10), 18, 0);
  }

  const monthDayMatch = value.match(/^(\d{1,2})(?:\s*(?:число|числа|го|ое|е))?$/u);
  if (monthDayMatch) {
    const [, month] = reportDate.split('-');
    const year = reportDate.slice(0, 4);
    const day = String(Number(monthDayMatch[1])).padStart(2, '0');
    return createKrasnoyarskDate(`${year}-${month}-${day}`, 18, 0);
  }

  return null;
}

function createKrasnoyarskDate(date, hours, minutes) {
  if (hours > 23 || minutes > 59) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, hours - 7, minutes));
}

function getWeekdayIndex(value) {
  const weekdays = [
    ['понедельник', 'пн'],
    ['вторник', 'вт'],
    ['среда', 'ср'],
    ['четверг', 'чт'],
    ['пятница', 'пт'],
    ['суббота', 'сб'],
    ['воскресенье', 'вс'],
  ];
  const index = weekdays.findIndex((aliases) => aliases.includes(value));
  return index === -1 ? null : index + 1;
}

function updateSaveButtons() {
  updateSaveButton(elements.saveReportButton);
}

function updateSaveButton(button) {
  if (!button) return;
  const { employee, roleMetrics: metrics } = getOwnerContext();
  const hasMetrics = Boolean(employee) && metrics.length > 0;
  const pendingMetrics = getPendingFilledMetrics(state.report, metrics);
  const submitted = areAllMetricsSubmitted(state.report, metrics);
  button.disabled = !hasMetrics || pendingMetrics.length === 0;
  button.title = !hasMetrics
    ? 'Данные из таблицы не загружены или нет метрик для выбранного ФИО'
    : submitted
      ? 'Все метрики уже сохранены за выбранный день'
      : pendingMetrics.length > 0 ? '' : 'Заполните хотя бы одну новую метрику — остальные можно дозаполнить позже';
  button.setAttribute('aria-disabled', String(button.disabled));
}

function updateSubmittedFeedback() {
  if (!elements.saveFeedback.textContent.includes('уже полностью сохранён')) {
    elements.saveFeedback.textContent = '';
  }
}

elements.ownerInput.addEventListener('change', (event) => {
  state.report = createEditableReport(state.date, event.target.value);
  render();
});
elements.saveReportButton.addEventListener('click', saveReport);
elements.exportButton.addEventListener('click', exportCsv);


function createEditableReport(date, owner) {
  const storedReport = getReportForDate(state.reports, date, state.catalog.checklist, owner);
  return {
    ...createEmptyReport(date, state.catalog.checklist, owner),
    submittedCategories: storedReport.submittedCategories ?? {},
    submittedMetricIds: storedReport.submittedMetricIds ?? {},
  };
}

function getDefaultOwner() {
  return state.catalog.infoRows[0]?.fullName ?? '';
}

function refreshOwnerOptions() {
  elements.ownerInput.innerHTML = '';

  if (state.catalog.infoRows.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Нет данных из таблицы';
    option.disabled = true;
    option.selected = true;
    elements.ownerInput.append(option);
    return;
  }

  for (const employee of state.catalog.infoRows) appendOwnerOption(employee.fullName);
}

function hasCatalogOwner(owner) {
  return state.catalog.infoRows.some((employee) => employee.fullName === owner);
}

async function hydrateCatalog() {
  try {
    state.catalog = await loadCatalog();
    state.sheetReports = buildReportsFromDataRows(state.catalog.dataRows, state.catalog.checklist);
    state.reports = mergeReports(state.sheetReports, state.localReports);
    const defaultOwner = getDefaultOwner();
    const selectedOwner = hasCatalogOwner(state.report?.owner) ? state.report.owner : defaultOwner;
    state.report = createEditableReport(state.date, selectedOwner);
    if (!state.report.owner && defaultOwner) state.report.owner = defaultOwner;
    refreshOwnerOptions();
    render();
  } finally {
    hideLoadingScreen();
  }
}

function hideLoadingScreen() {
  document.body.classList.remove('is-loading');
  if (elements.loadingScreen) elements.loadingScreen.hidden = true;
}

hydrateCatalog();
