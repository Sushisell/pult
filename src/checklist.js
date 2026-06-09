export const FREQUENCIES = {
  daily: 'ежедневно',
  weekly: 'еженедельно',
  monthly: 'ежемесячно',
};

export const CATEGORIES = [
  { id: 'daily', label: 'Ежедневно', icon: '📅' },
  { id: 'weekly', label: 'Еженедельно', icon: '🗓️' },
  { id: 'monthly', label: 'Ежемесячно', icon: '📆' },
];

export const INFO_ROWS = [];

export const METRIC_SHEETS = [];

export const CHECKLIST = createChecklist(METRIC_SHEETS);

export const STATUS = {
  done: 'Все ок',
  fixed: 'Найдены ошибки, исправлены',
  issue: 'Нельзя исправить ошибку',
};

export function createCatalog({ infoRows = INFO_ROWS, metricSheets = METRIC_SHEETS, dataRows = [] } = {}) {
  return {
    infoRows: normalizeInfoRows(infoRows),
    metricSheets: normalizeMetricSheets(metricSheets),
    checklist: createChecklist(metricSheets),
    dataRows: normalizeDataRows(dataRows),
  };
}

export function createChecklist(metricSheets = METRIC_SHEETS) {
  return normalizeMetricSheets(metricSheets).flatMap((sheet) => sheet.rows.map((row, index) => ({
    ...row,
    id: row.id || `${slugify(sheet.name)}-${index + 1}`,
    category: getFrequencyCategory(row.frequency),
    sourceSheet: sheet.name,
    sourceRow: row.sourceRow ?? index + 2,
  })));
}

export function findEmployeeByFullName(fullName, infoRows = INFO_ROWS) {
  const normalizedFullName = normalizeText(fullName);
  if (!normalizedFullName) return null;
  return infoRows.find((row) => normalizeText(row.fullName) === normalizedFullName) ?? null;
}

export function getMetricsForRole(role, checklist = CHECKLIST) {
  const employeeRoles = splitRoleAliases(role);
  if (employeeRoles.length === 0) return [];
  return checklist.filter((item) => roleMatches(employeeRoles, item.role));
}

export function groupMetricsByFrequency(metrics) {
  return CATEGORIES.map((category) => ({
    ...category,
    items: metrics.filter((item) => item.category === category.id),
  })).filter((group) => group.items.length > 0);
}


function roleMatches(employeeRoles, metricRole) {
  const metricRoles = splitRoleAliases(metricRole);
  return employeeRoles.some((employeeRole) => metricRoles.includes(employeeRole));
}

function splitRoleAliases(role) {
  return normalizeText(role)
    .split(/[,;/|]+|\s+и\s+|\s+или\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeInfoRows(infoRows) {
  const rows = infoRows
    .map((row) => ({
      fullName: String(row.fullName ?? row.name ?? row['ФИО'] ?? '').trim(),
      role: String(row.role ?? row['Роль'] ?? '').trim(),
      managerRole: String(row.managerRole ?? row.manager ?? row['Роль руководителя'] ?? '').trim(),
    }))
    .filter((row) => row.fullName && row.role);

  return mergeInfoRowsByFullName(rows);
}

function mergeInfoRowsByFullName(rows) {
  const rowsByName = new Map();

  for (const row of rows) {
    const key = normalizeText(row.fullName);
    const current = rowsByName.get(key);

    if (!current) {
      rowsByName.set(key, { ...row });
      continue;
    }

    current.role = joinUniqueList(current.role, row.role);
    current.managerRole = joinUniqueList(current.managerRole, row.managerRole);
  }

  return [...rowsByName.values()];
}

function joinUniqueList(...values) {
  const items = [];
  const normalizedItems = new Set();

  for (const value of values) {
    for (const item of splitRawRoleAliases(value)) {
      const normalizedItem = normalizeText(item);
      if (!normalizedItems.has(normalizedItem)) {
        normalizedItems.add(normalizedItem);
        items.push(item);
      }
    }
  }

  return items.join(', ');
}

function splitRawRoleAliases(role) {
  return String(role ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(/[,;/|]+|\s+и\s+|\s+или\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeMetricSheets(metricSheets) {
  return metricSheets
    .map((sheet) => ({
      name: String(sheet.name ?? sheet.title ?? '').trim(),
      rows: normalizeMetricRows(sheet.rows ?? []),
    }))
    .filter((sheet) => sheet.name && sheet.rows.length > 0);
}

function normalizeMetricRows(rows) {
  return rows
    .map((row) => ({
      frequency: String(row.frequency ?? row['Периодичность'] ?? '').trim(),
      metric: String(row.metric ?? row['Метрика'] ?? '').trim(),
      description: String(row.description ?? row['Описание'] ?? row.reportFormat ?? row['Формат отчёта'] ?? '').trim(),
      goal: String(row.goal ?? row['Цель'] ?? '').trim(),
      deadline: String(row.deadline ?? row.dueDate ?? row['Срок сдачи'] ?? row['Дедлайн'] ?? '').trim(),
      role: String(row.role ?? row['Должность ответственного'] ?? row['Роль'] ?? '').trim(),
      managerRole: String(row.managerRole ?? row.dashboardManagerRole ?? row['Руководитель для дашборда'] ?? row['Роль руководителя'] ?? '').trim(),
      reportFormat: String(row.reportFormat ?? row['Формат отчёта'] ?? row.description ?? row['Описание'] ?? row.classification ?? row['Классификация'] ?? 'Проверено / не проверено').trim(),
      classification: String(row.classification ?? row['Классификация'] ?? row['Классификация метрики'] ?? row.type ?? row['Тип'] ?? '').trim(),
      type: getMetricType(row),
      placeholder: row.placeholder ?? row['Плейсхолдер'] ?? undefined,
      suffix: row.suffix ?? row['Суффикс'] ?? undefined,
      sourceRow: row.sourceRow ?? row['Строка'] ?? undefined,
    }))
    .filter((row) => row.frequency && row.metric && row.role);
}

function normalizeDataRows(dataRows) {
  return dataRows
    .map((row) => ({
      date: String(row.date ?? row['Дата'] ?? '').trim(),
      owner: String(row.owner ?? row.fullName ?? row['ФИО'] ?? '').trim(),
      metric: String(row.metric ?? row['Метрика'] ?? '').trim(),
      value: String(row.value ?? row['Значение'] ?? '').trim(),
      comment: String(row.comment ?? row['Комментарий'] ?? '').trim(),
    }))
    .filter((row) => row.date && row.owner && row.metric);
}

function getMetricType(row) {
  const rawType = String(row.type ?? row['Тип'] ?? '').trim();
  const classification = normalizeText(row.classification ?? row['Классификация'] ?? row['Классификация метрики'] ?? rawType);
  if (classification === 'ввод числа' || classification === 'number') return 'number';
  if (classification === 'проверено' || classification === 'checkbox') return 'checkbox';
  return rawType || 'checkbox';
}

function getFrequencyCategory(frequency) {
  const normalizedFrequency = normalizeText(frequency);
  const entry = Object.entries(FREQUENCIES).find(([, label]) => normalizeText(label) === normalizedFrequency);
  return entry?.[0] ?? 'daily';
}

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
