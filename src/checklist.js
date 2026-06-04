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

export const INFO_ROWS = [
  { fullName: 'Коваленко Марина Сергеевна', role: 'HR', managerRole: 'Операционный директор' },
  { fullName: 'Иванова Анна Петровна', role: 'Франчайзинг', managerRole: 'Операционный директор' },
  { fullName: 'Петрова Ольга Андреевна', role: 'Маркетинг', managerRole: 'Операционный директор' },
  { fullName: 'Смирнов Алексей Викторович', role: 'Операционный директор', managerRole: '' },
];

export const METRIC_SHEETS = [
  {
    name: 'HR',
    rows: [
      {
        frequency: 'ежедневно',
        metric: 'Проверка работы карьерного сайта',
        role: 'HR',
        reportFormat: 'Форма отправляет лид, лиды приходят в CRM',
        type: 'checkbox',
      },
      {
        frequency: 'ежедневно',
        metric: 'Проверка ЛК Avito',
        role: 'HR',
        reportFormat: 'Баланс, активные вакансии, обработка откликов рекрутерами',
        type: 'checkbox',
      },
      {
        frequency: 'ежедневно',
        metric: 'Проверка ЛК hh',
        role: 'HR',
        reportFormat: 'Вакансии активны, поднятия по плану, баланс',
        type: 'checkbox',
      },
      {
        frequency: 'ежедневно',
        metric: 'Ежедневный контроль индекса вежливости компании на HH',
        role: 'HR',
        reportFormat: 'Введите текущее значение индекса',
        type: 'number',
        placeholder: 'Например, 94',
        suffix: '%',
      },
      {
        frequency: 'еженедельно',
        metric: 'Проверка динамики откликов и стоимости найма по каналам',
        role: 'HR',
        reportFormat: 'Краткий вывод по каналам и рискам',
        type: 'checkboxWithText',
        placeholder: 'Какие каналы требуют внимания?',
      },
      {
        frequency: 'ежемесячно',
        metric: 'Сводный отчёт по найму и текучести персонала',
        role: 'HR',
        reportFormat: 'Отчёт загружен и согласован',
        type: 'checkbox',
      },
    ],
  },
  {
    name: 'Франчайзинг',
    rows: [
      {
        frequency: 'ежедневно',
        metric: 'Новые заявки франчайзи разобраны и переданы ответственным',
        role: 'Франчайзинг',
        reportFormat: 'Проверено / не проверено',
        type: 'checkbox',
      },
      {
        frequency: 'ежедневно',
        metric: 'Воронка франчайзинга обновлена: статусы, следующие шаги, даты касаний',
        role: 'Франчайзинг',
        reportFormat: 'Проверено / не проверено',
        type: 'checkbox',
      },
      {
        frequency: 'еженедельно',
        metric: 'Партнёры с риском просрочки коммуникации отмечены в комментариях',
        role: 'Франчайзинг',
        reportFormat: 'Проверено / не проверено + комментарий',
        type: 'checkboxWithText',
        placeholder: 'Кого нужно дожать?',
      },
      {
        frequency: 'ежемесячно',
        metric: 'План открытия новых точек актуализирован',
        role: 'Франчайзинг',
        reportFormat: 'План обновлён, отклонения описаны',
        type: 'checkboxWithText',
        placeholder: 'Какие открытия под риском?',
      },
    ],
  },
  {
    name: 'Маркетинг',
    rows: [
      {
        frequency: 'ежедневно',
        metric: 'Рекламные кабинеты активны, бюджеты и лимиты не остановили кампании',
        role: 'Маркетинг',
        reportFormat: 'Проверено / не проверено',
        type: 'checkbox',
      },
      {
        frequency: 'ежедневно',
        metric: 'Лиды за день сверены с CRM и источниками трафика',
        role: 'Маркетинг',
        reportFormat: 'Число лидов + статус проверки',
        type: 'number',
        placeholder: 'Например, 128',
        suffix: 'лидов',
      },
      {
        frequency: 'еженедельно',
        metric: 'Контент-план и публикации на неделю готовы',
        role: 'Маркетинг',
        reportFormat: 'Проверено / не проверено',
        type: 'checkbox',
      },
      {
        frequency: 'ежемесячно',
        metric: 'Отчёт по ROMI и эффективности каналов подготовлен',
        role: 'Маркетинг',
        reportFormat: 'Отчёт с выводами и действиями',
        type: 'checkboxWithText',
        placeholder: 'Ключевые выводы месяца',
      },
    ],
  },
];

export const CHECKLIST = createChecklist(METRIC_SHEETS);

export const STATUS = {
  done: 'Всё ок',
  issue: 'Найдены проблемы',
  skipped: 'Не проверено',
};

export function createCatalog({ infoRows = INFO_ROWS, metricSheets = METRIC_SHEETS } = {}) {
  return {
    infoRows: normalizeInfoRows(infoRows),
    metricSheets: normalizeMetricSheets(metricSheets),
    checklist: createChecklist(metricSheets),
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
  const normalizedRole = normalizeText(role);
  if (!normalizedRole) return [];
  return checklist.filter((item) => roleMatches(normalizedRole, item.role));
}

export function groupMetricsByFrequency(metrics) {
  return CATEGORIES.map((category) => ({
    ...category,
    items: metrics.filter((item) => item.category === category.id),
  })).filter((group) => group.items.length > 0);
}


function roleMatches(normalizedRole, metricRole) {
  const metricRoles = splitRoleAliases(metricRole);
  return metricRoles.includes(normalizedRole);
}

function splitRoleAliases(role) {
  return normalizeText(role)
    .split(/[,;/|]+|\s+и\s+|\s+или\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeInfoRows(infoRows) {
  return infoRows
    .map((row) => ({
      fullName: String(row.fullName ?? row.name ?? row['ФИО'] ?? '').trim(),
      role: String(row.role ?? row['Роль'] ?? '').trim(),
      managerRole: String(row.managerRole ?? row.manager ?? row['Роль руководителя'] ?? '').trim(),
    }))
    .filter((row) => row.fullName && row.role);
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
      role: String(row.role ?? row['Должность ответственного'] ?? row['Роль'] ?? '').trim(),
      managerRole: String(row.managerRole ?? row.dashboardManagerRole ?? row['Руководитель для дашборда'] ?? row['Роль руководителя'] ?? '').trim(),
      reportFormat: String(row.reportFormat ?? row['Формат отчёта'] ?? row.description ?? row['Описание'] ?? 'Проверено / не проверено').trim(),
      type: String(row.type ?? row['Тип'] ?? 'checkbox').trim(),
      placeholder: row.placeholder ?? row['Плейсхолдер'] ?? undefined,
      suffix: row.suffix ?? row['Суффикс'] ?? undefined,
      sourceRow: row.sourceRow ?? row['Строка'] ?? undefined,
    }))
    .filter((row) => row.frequency && row.metric && row.role);
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
