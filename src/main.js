import { CATEGORIES, INFO_ROWS, CHECKLIST, STATUS, findEmployeeByFullName, getMetricsForRole, groupMetricsByFrequency } from './checklist.js?v=0.1.11';
import { loadCatalog, submitDataRows } from './data-source.js?v=0.1.11';
import { APP_VERSION } from './version.js?v=0.1.11';
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
  mergeReportFilledRows,
  mergeReports,
  saveReports,
  todayISO,
  upsertReport,
  makeReportKey,
  reconcileSubmittedMetricsWithSheetReports,
} from './storage.js?v=0.1.11';

const state = {
  localReports: loadReports(),
  sheetReports: {},
  reports: {},
  date: todayISO(),
  frequencyFilter: 'all',
  dashboardFrequencyFilters: new Set(CATEGORIES.map((category) => category.id)),
  activeView: 'report',
  report: null,
  department: '',
  hasSelectedIdentity: false,
  catalog: {
    infoRows: INFO_ROWS,
    checklist: CHECKLIST,
  },
};

const elements = {
  appVersion: document.querySelector('#app-version'),
  loadingScreen: document.querySelector('#loading-screen'),
  dateInput: document.querySelector('#date-input'),
  departmentInput: document.querySelector('#department-input'),
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
  heroScorePreview: document.querySelector('#hero-score-preview'),
  doneCount: document.querySelector('#done-count'),
  issueCount: document.querySelector('#issue-count'),
  skippedCount: document.querySelector('#skipped-count'),
  managerDashboard: document.querySelector('#manager-dashboard'),
  reportView: document.querySelector('#report-view'),
  dashboardView: document.querySelector('#dashboard-view'),
  viewTabs: document.querySelector('#view-tabs'),
};

state.reports = { ...state.localReports };
state.report = createEditableReport(state.date, '');
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
  state.reports = upsertReport(state.reports, mergeReportFilledRows(state.reports[makeReportKey(nextReport.date, nextReport.owner)], nextReport));
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
  const employee = findSelectedEmployee();
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
  elements.departmentInput.value = hasCatalogDepartment(state.department) ? state.department : '';
  elements.ownerInput.value = hasCatalogOwner(state.report.owner, state.department) ? state.report.owner : '';
  elements.checklistBody.hidden = !state.hasSelectedIdentity;
  elements.tabs.hidden = !state.hasSelectedIdentity;
  elements.heroScore.setAttribute('aria-label', `Выполнено ${completion.percent}%`);
  elements.heroScore.innerHTML = `
    <span class="score-icon">✓</span>
    <strong>${completion.percent}%</strong>
    <span>${completion.done} из ${completion.total} проверено</span>
  `;
  if (elements.heroScorePreview) elements.heroScorePreview.textContent = `${completion.percent}%`;
  elements.doneCount.textContent = completion.done;
  elements.issueCount.textContent = completion.issues;
  elements.skippedCount.textContent = completion.skipped;
  updateSaveButtons();
  updateSubmittedFeedback();
  renderTabs();
  renderChecklist(context);
  renderSummary();
  renderViews(context.employee);
}

function renderViews(employee) {
  const hasDashboard = Boolean(employee) && getDashboardEmployees(employee).length > 0;
  if (state.activeView === 'dashboard' && !hasDashboard) state.activeView = 'report';

  if (elements.reportView) elements.reportView.hidden = state.activeView !== 'report';
  if (elements.dashboardView) elements.dashboardView.hidden = state.activeView !== 'dashboard' || !hasDashboard;
  renderViewTabs(hasDashboard);
  renderManagerDashboard(employee, { isAvailable: hasDashboard });
}

function renderViewTabs(hasDashboard) {
  if (!elements.viewTabs) return;
  elements.viewTabs.innerHTML = '';
  const tabs = [
    { id: 'report', label: 'Отчёт по метрикам', disabled: false },
    { id: 'dashboard', label: 'Дашборд метрик', disabled: !hasDashboard },
  ];

  for (const tab of tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'view-tab';
    button.textContent = tab.label;
    button.disabled = tab.disabled;
    button.setAttribute('aria-selected', String(state.activeView === tab.id));
    button.setAttribute('aria-controls', tab.id === 'report' ? 'report-view' : 'dashboard-view');
    if (tab.disabled) button.title = 'Дашборд появится, если у сотрудника есть свои метрики или метрики подчинённых.';
    button.addEventListener('click', () => {
      if (tab.disabled) return;
      state.activeView = tab.id;
      render();
    });
    elements.viewTabs.append(button);
  }
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

  if (!state.hasSelectedIdentity) {
    elements.activeCategoryTitle.textContent = 'Сначала выберите отдел и ФИО';
    elements.activeCategoryCount.textContent = '0 из 0 проверено';
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Метрики появятся после выбора даты отчёта, отдела и сотрудника.';
    elements.checklistBody.append(empty);
    return;
  }

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
  if (isNumericMetric(item)) card.classList.add('is-number');
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

  if (isNumericMetric(item)) {
    const hint = document.createElement('span');
    hint.className = 'metric-input-hint';
    hint.textContent = item.type === 'percent' ? 'Введите процент: например 35 или 35,5%' : 'Введите числовое значение';
    wrapper.append(hint);
  }

  if (item.description || item.goal) {
    const details = document.createElement('div');
    details.className = 'metric-details';
    if (item.description) {
      const description = document.createElement('div');
      description.className = 'metric-detail metric-detail-description';
      description.append(createMetricDetailLabel('Описание'));
      appendTextWithLinks(description, item.description);
      details.append(description);
    }
    if (item.goal) {
      const goal = document.createElement('div');
      goal.className = 'metric-detail metric-detail-goal';
      goal.append(createMetricDetailLabel('Цель'), document.createTextNode(item.goal));
      details.append(goal);
    }
    wrapper.append(details);
  }

  const meta = createMetricMeta(item, row);
  if (meta) wrapper.append(meta);

  return wrapper;
}


function createMetricDetailLabel(text) {
  const label = document.createElement('span');
  label.className = 'metric-detail-label';
  label.textContent = `${text}:`;
  return label;
}

function isNumericMetric(metric) {
  return metric?.type === 'number' || metric?.type === 'percent';
}

function createMetricMeta(item, row) {
  const badges = [];
  if (item.deadline) {
    badges.push({
      label: getMetricDeadlineBadgeLabel(item),
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

  if (isNumericMetric(item)) {
    const inlineField = document.createElement('div');
    inlineField.className = 'inline-field';
    const input = document.createElement('input');
    input.type = 'number';
    input.value = row.value;
    input.placeholder = item.placeholder ?? (item.type === 'percent' ? '0%' : '0');
    input.disabled = isMetricLocked(item);
    input.addEventListener('input', (event) => {
      updateRow(item.id, { value: event.target.value }, { shouldRender: false });
      updateSaveButtons();
    });
    const suffix = document.createElement('span');
    suffix.textContent = item.suffix ?? (item.type === 'percent' ? '%' : '');
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
  textarea.addEventListener('input', (event) => {
    updateRow(item.id, { comment: event.target.value }, { shouldRender: false });
    updateSaveButtons();
  });
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


function renderManagerDashboard(employee, { isAvailable = false } = {}) {
  if (!elements.managerDashboard) return;
  elements.managerDashboard.innerHTML = '';

  if (!employee || !isAvailable) {
    elements.managerDashboard.hidden = true;
    return;
  }

  const team = getDashboardEmployees(employee);
  if (team.length === 0) {
    elements.managerDashboard.hidden = true;
    return;
  }

  const dashboard = buildManagerMetricsDashboard(team);
  elements.managerDashboard.hidden = false;
  elements.managerDashboard.append(
    createManagerHero(employee, dashboard),
    createManagerFrequencyFilters(),
    createManagerKpiGrid(dashboard),
    createManagerSections(dashboard),
  );
}

function buildManagerMetricsDashboard(team) {
  const selectedCategories = getSelectedDashboardCategories();
  const metricStates = selectedCategories.flatMap((category) => buildDashboardFrequencyStates(team, category));
  return {
    team,
    metricStates,
    totals: getDashboardTotals(metricStates),
    byFrequency: selectedCategories.map((category) => ({
      ...category,
      states: metricStates.filter((entry) => entry.metric.category === category.id),
    })).filter((group) => group.states.length > 0),
    roleHealth: createRoleHealth(metricStates),
  };
}

function getSelectedDashboardCategories() {
  const selected = CATEGORIES.filter((category) => state.dashboardFrequencyFilters.has(category.id));
  return selected.length > 0 ? selected : CATEGORIES;
}

function buildDashboardFrequencyStates(team, category) {
  const periods = getDashboardPeriods(category.id, state.date);
  return periods.flatMap((period) => team.flatMap((teammate) => {
    const roleMetrics = getMetricsForRole(teammate.role, state.catalog.checklist)
      .filter((metric) => metric.category === category.id);
    return roleMetrics.map((metric) => {
      const report = getDashboardPeriodReport(teammate.fullName, metric, period);
      return createDashboardMetricState(metric, report, teammate, period);
    });
  }));
}

function getDashboardPeriods(categoryId, date) {
  if (categoryId === 'daily') {
    return Array.from({ length: 5 }, (_, index) => {
      const isoDate = shiftISODate(date, index - 4);
      return { id: isoDate, start: isoDate, end: isoDate, label: formatRuDate(isoDate) };
    });
  }

  if (categoryId === 'weekly') {
    return Array.from({ length: 3 }, (_, index) => {
      const weekDate = shiftISODate(date, index * -7);
      const period = getWeekPeriod(weekDate);
      return { ...period, id: period.start, label: `${formatRuDate(period.start)}–${formatRuDate(period.end)}` };
    });
  }

  const period = getMonthPeriod(date);
  return [{ ...period, id: period.start, label: `${formatRuDate(period.start)}–${formatRuDate(period.end)}` }];
}

function getDashboardPeriodReport(owner, metric, period) {
  if (metric.category === 'daily') {
    return getReportForDate(state.sheetReports, period.start, state.catalog.checklist, owner);
  }

  const reports = Object.values(state.sheetReports)
    .filter((report) => report.owner === owner && report.date >= period.start && report.date <= period.end)
    .sort((a, b) => b.date.localeCompare(a.date));
  return reports.find((report) => isMetricFilled(report, metric.id))
    ?? getReportForDate(state.sheetReports, period.start, state.catalog.checklist, owner);
}

function shiftISODate(date, days) {
  const [year, month, day] = String(date).split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function getWeekPeriod(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const day = parsed.getUTCDay() || 7;
  const start = new Date(parsed);
  start.setUTCDate(parsed.getUTCDate() - day + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function getMonthPeriod(date) {
  const [year, month] = String(date).split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function createDashboardMetricState(metric, report, teammate, period) {
  const row = report.rows.find((entry) => entry.id === metric.id);
  const filled = isMetricFilled(report, metric.id);
  const rawStatus = row?.status ?? '';
  const status = filled ? rawStatus || 'done' : 'empty';
  return { metric, report, row, teammate, filled, status, period };
}

function getDashboardTotals(states) {
  const total = states.length;
  const counts = {
    done: states.filter((entry) => entry.status === 'done').length,
    fixed: states.filter((entry) => entry.status === 'fixed').length,
    issue: states.filter((entry) => entry.status === 'issue').length,
    empty: states.filter((entry) => entry.status === 'empty').length,
  };
  return {
    ...counts,
    total,
    health: total === 0 ? 0 : Math.round(((counts.done + counts.fixed) / total) * 100),
  };
}

function createManagerHero(employee, dashboard) {
  const hero = document.createElement('div');
  hero.className = 'manager-hero';
  hero.innerHTML = `
    <div>
      <p class="manager-eyebrow">Дашборд метрик</p>
      <h2>Контроль процессов: ${escapeHtml(employee.role)}</h2>
      <span>${getManagedEmployees(employee).length > 0 ? 'Состояние команды и личных метрик' : 'Состояние личных метрик'} на ${escapeHtml(formatRuDate(state.date))}</span>
    </div>
    <div class="manager-health-card">
      <span>Индекс здоровья процессов</span>
      <strong>${dashboard.totals.health}%</strong>
      <small>${dashboard.totals.health >= 85 ? 'Система работает штатно' : dashboard.totals.health >= 70 ? 'Есть зоны внимания' : 'Нужна реакция руководителя'}</small>
    </div>
  `;
  return hero;
}

function createManagerFrequencyFilters() {
  const wrapper = document.createElement('div');
  wrapper.className = 'manager-frequency-filters';
  wrapper.setAttribute('aria-label', 'Диаграммы для дашборда руководителя');

  for (const category of CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'frequency-filter';
    button.textContent = `${category.icon} ${category.label}`;
    button.setAttribute('aria-pressed', String(state.dashboardFrequencyFilters.has(category.id)));
    button.addEventListener('click', () => {
      if (state.dashboardFrequencyFilters.has(category.id) && state.dashboardFrequencyFilters.size > 1) {
        state.dashboardFrequencyFilters.delete(category.id);
      } else {
        state.dashboardFrequencyFilters.add(category.id);
      }
      render();
    });
    wrapper.append(button);
  }

  return wrapper;
}

function createManagerKpiGrid({ totals }) {
  const grid = document.createElement('div');
  grid.className = 'manager-kpi-grid';
  const items = [
    ['Всего метрик', totals.total, 'total'],
    ['Все ок', totals.done, 'done'],
    ['Ошибки исправлены', totals.fixed, 'fixed'],
    ['Ошибки не исправлены', totals.issue, 'issue'],
    ['Не заполнено', totals.empty, 'empty'],
  ];
  grid.innerHTML = items.map(([label, value, status]) => `
    <article class="manager-kpi manager-kpi-${status}">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </article>
  `).join('');
  return grid;
}

function createManagerSections(dashboard) {
  const wrapper = document.createElement('div');
  wrapper.className = 'manager-sections';
  for (const group of dashboard.byFrequency) wrapper.append(createManagerFrequencySection(group));
  wrapper.append(createManagerLegend(), createManagerRoleHealth(dashboard.roleHealth, dashboard.totals));
  return wrapper;
}

function createManagerFrequencySection(group) {
  const section = document.createElement('section');
  section.className = `manager-frequency-card manager-frequency-card-${group.id}`;
  const totals = getDashboardTotals(group.states);
  const periods = getManagerSectionPeriods(group.states);
  const rows = getManagerMetricMatrixRows(group.states, periods);
  const metricLabel = rows.length === 1 ? 'метрика' : rows.length > 1 && rows.length < 5 ? 'метрики' : 'метрик';
  const title = group.id === 'daily' ? 'Ежедневные проверки' : `${group.label} проверки`;
  const subtitle = group.id === 'daily'
    ? `${rows.length} ${metricLabel} · последние 5 дней до выбранной даты включительно`
    : `${rows.length} ${metricLabel} · ${periods.length} периодов · статусы показаны только цветными кружками`;

  section.innerHTML = `
    <div class="manager-card-title manager-card-title-rich">
      <div>
        <span>${escapeHtml(group.icon)} ${escapeHtml(group.label)}</span>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <b>${totals.health}%</b>
    </div>
    <p class="manager-card-subtitle">${escapeHtml(subtitle)}</p>
    <div class="manager-matrix-wrap">
      <table class="manager-matrix">
        <thead>
          <tr>
            <th scope="col">Метрика</th>
            ${periods.map((period) => `<th scope="col">${escapeHtml(period.shortLabel)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <th scope="row">${escapeHtml(row.metric.metric)}</th>
              ${isNumericMetric(row.metric)
                ? createManagerMatrixChartCell(row, periods)
                : periods.map((period) => createManagerMatrixDotCell(row.byPeriod.get(period.id))).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="manager-progress" aria-label="Здоровье ${escapeHtml(group.label.toLowerCase())}: ${totals.health}%"><span style="width:${totals.health}%"></span></div>
  `;
  return section;
}

function getManagerSectionPeriods(states) {
  const periods = [];
  const seen = new Set();
  for (const entry of states) {
    if (seen.has(entry.period.id)) continue;
    seen.add(entry.period.id);
    periods.push({ ...entry.period, shortLabel: getManagerPeriodShortLabel(entry.period) });
  }
  return periods;
}

function getManagerPeriodShortLabel(period) {
  if (period.start === period.end) return `${formatRuDateShort(period.start)} (${getRuWeekdayShort(period.start)})`;
  return `${formatRuDateShort(period.start)}–${formatRuDateShort(period.end)}`;
}

function getRuWeekdayShort(date) {
  const weekdays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return weekdays[parsed.getUTCDay()] ?? '';
}

function formatRuDateShort(date) {
  const [, month, day] = String(date).split('-');
  return `${day}.${month}`;
}

function getManagerMetricMatrixRows(states, periods) {
  const rows = new Map();
  for (const entry of states) {
    const row = rows.get(entry.metric.id) ?? { metric: entry.metric, byPeriod: new Map() };
    const entries = row.byPeriod.get(entry.period.id)?.entries ?? [];
    entries.push(entry);
    row.byPeriod.set(entry.period.id, createManagerMatrixCellState(entries));
    rows.set(entry.metric.id, row);
  }
  return [...rows.values()].sort((a, b) => a.metric.metric.localeCompare(b.metric.metric, 'ru'))
    .map((row) => {
      for (const period of periods) {
        if (!row.byPeriod.has(period.id)) row.byPeriod.set(period.id, createManagerMatrixCellState([]));
      }
      return row;
    });
}

function createManagerMatrixCellState(entries) {
  const statusPriority = ['issue', 'empty', 'fixed', 'done'];
  const counts = Object.fromEntries([...statusPriority, 'total'].map((key) => [key, 0]));
  for (const entry of entries) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    counts.total += 1;
  }
  const status = statusPriority.find((key) => counts[key] > 0) ?? 'empty';
  return { status, counts, entries };
}


function createManagerMatrixChartCell(row, periods) {
  const points = periods.map((period) => getManagerNumericPoint(row.byPeriod.get(period.id), row.metric));
  const values = points.map((point) => point.value).filter((value) => Number.isFinite(value));
  const title = values.length > 0
    ? `Динамика: ${points.map((point) => `${point.label}: ${point.display ?? 'нет данных'}`).join(' · ')}`
    : 'Нет числовых данных для диаграммы';
  return `<td class="manager-chart-cell" colspan="${periods.length}">${createManagerSparkline(points, row.metric, title)}</td>`;
}

function getManagerNumericPoint(cell, metric) {
  const values = (cell?.entries ?? [])
    .map((entry) => parseMetricNumber(entry.row?.value))
    .filter((value) => Number.isFinite(value));
  const value = values.length === 0 ? null : values.reduce((sum, item) => sum + item, 0) / values.length;
  return {
    value,
    label: cell?.entries?.[0]?.period ? getManagerPeriodShortLabel(cell.entries[0].period) : '',
    display: value === null ? null : formatMetricNumber(value, metric),
  };
}

function createManagerSparkline(points, metric, title) {
  const width = 360;
  const height = 96;
  const padding = 14;
  const values = points.map((point) => point.value).filter((value) => Number.isFinite(value));
  if (values.length === 0) return `<div class="manager-sparkline-empty">Нет данных</div>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : padding + ((width - padding * 2) * index) / (points.length - 1);
    const y = Number.isFinite(point.value) ? height - padding - ((point.value - min) / range) * (height - padding * 2) : null;
    return { ...point, x, y };
  });
  const line = coords.filter((point) => point.y !== null).map((point) => `${point.x},${point.y}`).join(' ');
  return `
    <div class="manager-sparkline" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true" focusable="false">
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" />
        <polyline points="${line}" />
        ${coords.filter((point) => point.y !== null).map((point) => `<g class="manager-sparkline-point"><circle cx="${point.x}" cy="${point.y}" r="4"><title>${escapeHtml(point.display)}</title></circle><text x="${point.x}" y="${Math.max(12, point.y - 10)}" text-anchor="middle">${escapeHtml(point.display)}</text></g>`).join('')}
      </svg>
      <div class="manager-sparkline-labels">
        ${points.map((point) => `<span>${escapeHtml(point.label)}: ${escapeHtml(point.display ?? 'нет данных')}</span>`).join('')}
      </div>
    </div>`;
}

function parseMetricNumber(value) {
  const normalized = String(value ?? '').replace('%', '').replace(',', '.').trim();
  if (!normalized) return NaN;
  return Number(normalized);
}

function formatMetricNumber(value, metric) {
  const formatted = Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  if (metric?.type === 'percent') return `${formatted}%`;
  return `${formatted}${metric?.suffix ? ` ${metric.suffix}` : ''}`;
}

function createManagerMatrixDotCell(cell) {
  const status = cell?.status ?? 'empty';
  const title = getManagerMatrixTitle(cell);
  return `<td><span class="manager-dot manager-dot-${status}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"></span></td>`;
}

function getManagerMatrixTitle(cell) {
  if (!cell || cell.counts.total === 0) return 'Не заполнено';
  return [
    `Всего: ${cell.counts.total}`,
    `ОК: ${cell.counts.done}`,
    `Исправлено: ${cell.counts.fixed}`,
    `Проблема: ${cell.counts.issue}`,
    `Не заполнено: ${cell.counts.empty}`,
  ].join(' · ');
}


function createManagerLegend() {
  const legend = document.createElement('section');
  legend.className = 'manager-legend';
  legend.setAttribute('aria-label', 'Расшифровка статусов дашборда');
  const items = [
    ['done', 'Все ок', 'Проверка выполнена без замечаний'],
    ['fixed', 'Исправлено', 'Были ошибки, но их уже исправили'],
    ['issue', 'Нужна помощь', 'Ошибка не исправлена или требует решения руководителя'],
    ['empty', 'Нет данных', 'Отчёт по метрике ещё не заполнен'],
  ];
  legend.innerHTML = `
    <h3>Что означают кружочки</h3>
    <div class="manager-legend-grid">
      ${items.map(([status, label, description]) => `
        <div class="manager-legend-item">
          <span class="manager-dot manager-dot-${status}" aria-hidden="true"></span>
          <div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></div>
        </div>
      `).join('')}
    </div>
  `;
  return legend;
}

function createManagerRoleHealth(roleHealth, totals) {
  const section = document.createElement('section');
  section.className = 'manager-role-health';
  section.innerHTML = `
    <div class="manager-card-title"><h3>Здоровье процессов по выбранным диаграммам</h3><b>${totals.health}%</b></div>
    <div class="manager-role-grid">
      ${roleHealth.map((item) => `
        <article>
          <span>${escapeHtml(item.role)}</span>
          <strong class="${item.health < 70 ? 'is-danger' : item.health < 85 ? 'is-warning' : ''}">${item.health}%</strong>
          <div class="manager-progress"><span style="width:${item.health}%"></span></div>
        </article>
      `).join('')}
    </div>
  `;
  return section;
}

function createRoleHealth(metricStates) {
  const groups = new Map();
  for (const entry of metricStates) {
    const current = groups.get(entry.metric.category) ?? [];
    current.push(entry);
    groups.set(entry.metric.category, current);
  }
  return CATEGORIES
    .filter((category) => groups.has(category.id))
    .map((category) => ({ role: `${category.label} диаграммы`, health: getDashboardTotals(groups.get(category.id)).health }));
}

function getDashboardStatusLabel(status) {
  if (status === 'empty') return 'Не заполнено';
  return STATUS[status] ?? 'Все ок';
}

function formatRuDate(date) {
  const [year, month, day] = String(date).split('-');
  return `${day}.${month}.${year}`;
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
  return getMetricDeadlineDisplay(metric, { prefix: 'Срок сдачи: ' });
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

function getDashboardEmployees(employee) {
  return [employee, ...getManagedEmployees(employee)];
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
  const selectedOwner = state.hasSelectedIdentity && hasCatalogOwner(state.report.owner, state.department) ? state.report.owner : '';
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
    const submittedReport = markReportMetricsSubmitted(state.report, pendingMetrics);
    const mergedSubmittedReport = mergeReportFilledRows(
      state.sheetReports[makeReportKey(submittedReport.date, submittedReport.owner)],
      submittedReport,
    );
    state.sheetReports = upsertReport(state.sheetReports, mergedSubmittedReport);
    persist(mergedSubmittedReport);
    const remoteNote = result.skipped ? '' : ' Данные отправлены на лист «Данные».';
    const leftCount = metrics.length - getCompletion(state.report, metrics).done;
    const laterNote = leftCount > 0 ? ` Осталось ${leftCount}; их можно дозаполнить позже.` : '';
    elements.saveFeedback.textContent = `Отчёт сохранён за ${state.date}: ${pendingMetrics.length} метрик.${remoteNote}${laterNote}`;
  } catch (error) {
    console.warn('Не удалось отправить данные в таблицу.', error);
    elements.saveFeedback.textContent = `Отчёт сохранён локально за ${state.date}, но таблица «Данные» не обновилась. Можно повторить сохранение позже.`;
  }
}


function getMetricDeadlineBadgeLabel(item) {
  const display = getMetricDeadlineDisplay(item, { prefix: '' }) || String(item.deadline ?? '').trim();
  return isMetricDeadlineExpired(item) ? `Срок истёк: ${display}` : `Срок: ${display}`;
}

function getMetricDeadlineDisplay(item, { prefix = '' } = {}) {
  const parsed = getMetricDeadlineDate(item.deadline, state.date);
  if (!parsed) {
    const fallback = String(item.deadline ?? '').trim();
    return fallback ? `${prefix}${fallback}` : '';
  }

  const localTime = formatDeadlineInUserTimeZone(parsed);
  return `${prefix}до ${localTime} по вашему времени`;
}

function formatDeadlineInUserTimeZone(date) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).format(date);
  } catch (error) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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
  if (timeMatch) return createDateWithUtcOffset(reportDate, Number(timeMatch[1]), Number(timeMatch[2] ?? 0), 3);

  const moscowTimeMatch = value.match(/(?:^|\s|к\s*)(\d{1,2})(?::(\d{2}))?\s*(?:по\s*)?(?:мск|москв\w*)/u);
  if (moscowTimeMatch) {
    return createDateWithUtcOffset(reportDate, Number(moscowTimeMatch[1]), Number(moscowTimeMatch[2] ?? 0), 3);
  }

  const krasnoyarskTimeMatch = value.match(/(?:^|\s|к\s*)(\d{1,2})(?::(\d{2}))?\s*(?:по\s*)?(?:крск|красноярск\w*)/u);
  if (krasnoyarskTimeMatch) {
    return createDateWithUtcOffset(reportDate, Number(krasnoyarskTimeMatch[1]), Number(krasnoyarskTimeMatch[2] ?? 0), 7);
  }

  const weekdayIndex = getWeekdayIndex(value);
  if (weekdayIndex !== null) {
    const [year, month, dayOfMonth] = reportDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
    const day = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    date.setUTCDate(date.getUTCDate() + weekdayIndex - day);
    return createDateWithUtcOffset(date.toISOString().slice(0, 10), 18, 0, 3);
  }

  const monthDayMatch = value.match(/^(\d{1,2})(?:\s*(?:число|числа|го|ое|е))?$/u);
  if (monthDayMatch) {
    const [, month] = reportDate.split('-');
    const year = reportDate.slice(0, 4);
    const day = String(Number(monthDayMatch[1])).padStart(2, '0');
    return createDateWithUtcOffset(`${year}-${month}-${day}`, 18, 0, 3);
  }

  return null;
}

function createDateWithUtcOffset(date, hours, minutes, utcOffsetHours) {
  if (hours > 23 || minutes > 59) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, hours - utcOffsetHours, minutes));
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
  const hasMetrics = state.hasSelectedIdentity && Boolean(employee) && metrics.length > 0;
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

elements.departmentInput.addEventListener('change', (event) => {
  state.department = event.target.value;
  state.hasSelectedIdentity = false;
  state.report = createEditableReport(state.date, '');
  refreshOwnerOptions();
  render();
});

elements.ownerInput.addEventListener('change', (event) => {
  state.hasSelectedIdentity = Boolean(event.target.value);
  state.report = createEditableReport(state.date, event.target.value);
  render();
});
elements.saveReportButton.addEventListener('click', saveReport);
elements.exportButton.addEventListener('click', exportCsv);


function createEditableReport(date, owner) {
  const storedReport = getReportForDate(state.reports, date, state.catalog.checklist, owner);
  return {
    ...createEmptyReport(date, state.catalog.checklist, owner),
    ...storedReport,
    date,
    owner,
    submittedCategories: storedReport.submittedCategories ?? {},
    submittedMetricIds: storedReport.submittedMetricIds ?? {},
  };
}

function refreshDepartmentOptions() {
  elements.departmentInput.innerHTML = '';

  if (state.catalog.infoRows.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Нет данных из таблицы';
    option.disabled = true;
    option.selected = true;
    elements.departmentInput.append(option);
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Выберите отдел';
  placeholder.disabled = true;
  placeholder.selected = !state.department;
  elements.departmentInput.append(placeholder);

  for (const department of getDepartments()) {
    const option = document.createElement('option');
    option.value = department;
    option.textContent = department;
    elements.departmentInput.append(option);
  }
}

function refreshOwnerOptions() {
  elements.ownerInput.innerHTML = '';

  if (state.catalog.infoRows.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Нет данных из таблицы';
    option.disabled = true;
    option.selected = true;
    elements.ownerInput.disabled = true;
    elements.ownerInput.append(option);
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = state.department ? 'Выберите ФИО' : 'Сначала выберите отдел';
  placeholder.disabled = true;
  placeholder.selected = !state.report?.owner;
  elements.ownerInput.append(placeholder);

  const employees = getEmployeesForDepartment(state.department);
  elements.ownerInput.disabled = employees.length === 0;
  for (const employee of employees) appendOwnerOption(employee.fullName);
}

function getDepartments() {
  return [...new Set(state.catalog.infoRows.map((employee) => employee.department).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

function getEmployeesForDepartment(department) {
  if (!department) return [];
  return state.catalog.infoRows
    .filter((employee) => employee.department === department)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
}

function findSelectedEmployee() {
  const employee = state.catalog.infoRows.find((row) => row.department === state.department && row.fullName === state.report.owner);
  return employee ?? findEmployeeByFullName(state.report.owner, state.catalog.infoRows);
}

function hasCatalogDepartment(department) {
  return getDepartments().includes(department);
}

function hasCatalogOwner(owner, department = state.department) {
  return getEmployeesForDepartment(department).some((employee) => employee.fullName === owner);
}

async function hydrateCatalog() {
  try {
    state.catalog = await loadCatalog();
    state.sheetReports = buildReportsFromDataRows(state.catalog.dataRows, state.catalog.checklist);
    state.reports = reconcileSubmittedMetricsWithSheetReports(
      mergeReports(state.localReports, state.sheetReports),
      state.sheetReports,
    );
    if (!hasCatalogDepartment(state.department)) state.department = '';
    const selectedOwner = state.hasSelectedIdentity && hasCatalogOwner(state.report?.owner, state.department) ? state.report.owner : '';
    state.report = createEditableReport(state.date, selectedOwner);
    refreshDepartmentOptions();
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
