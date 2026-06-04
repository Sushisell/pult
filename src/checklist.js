export const CATEGORIES = [
  { id: 'hr', label: 'HR', icon: '👥' },
  { id: 'franchise', label: 'Франчайзинг', icon: '🤝' },
  { id: 'marketing', label: 'Маркетинг', icon: '📣' },
];

export const CHECKLIST = [
  {
    id: 'hr-1',
    category: 'hr',
    metric: 'Карьерный сайт: форма отправляет лид, лиды приходят в CRM',
    reportFormat: 'Проверено / не проверено',
    type: 'checkbox',
  },
  {
    id: 'hr-2',
    category: 'hr',
    metric: 'ЛК Avito: баланс, активные вакансии, отклики обработаны рекрутерами',
    reportFormat: 'Проверено / не проверено',
    type: 'checkbox',
  },
  {
    id: 'hr-3',
    category: 'hr',
    metric: 'ЛК hh: вакансии активны, поднятия по плану, баланс под контролем',
    reportFormat: 'Проверено / не проверено',
    type: 'checkbox',
  },
  {
    id: 'hr-4',
    category: 'hr',
    metric: 'Индекс вежливости компании на HH',
    reportFormat: 'Число + статус проверки',
    type: 'number',
    placeholder: 'Например, 94',
    suffix: '%',
  },
  {
    id: 'hr-5',
    category: 'hr',
    metric: 'Saby работает, приказы дня проведены: отпуска, приёмы, увольнения',
    reportFormat: 'Проверено / не проверено',
    type: 'checkbox',
  },
  {
    id: 'hr-6',
    category: 'hr',
    metric: 'LMS: новички назначены на стартовый курс, активность идёт',
    reportFormat: 'Проверено / не проверено + комментарий',
    type: 'checkboxWithText',
    placeholder: 'Кто не активен?',
  },
  {
    id: 'fr-1',
    category: 'franchise',
    metric: 'Новые заявки франчайзи разобраны и переданы ответственным',
    reportFormat: 'Проверено / не проверено',
    type: 'checkbox',
  },
  {
    id: 'fr-2',
    category: 'franchise',
    metric: 'Воронка франчайзинга обновлена: статусы, следующие шаги, даты касаний',
    reportFormat: 'Проверено / не проверено',
    type: 'checkbox',
  },
  {
    id: 'fr-3',
    category: 'franchise',
    metric: 'Партнёры с риском просрочки коммуникации отмечены в комментариях',
    reportFormat: 'Проверено / не проверено + комментарий',
    type: 'checkboxWithText',
    placeholder: 'Кого нужно дожать?',
  },
  {
    id: 'mk-1',
    category: 'marketing',
    metric: 'Рекламные кабинеты активны, бюджеты и лимиты не остановили кампании',
    reportFormat: 'Проверено / не проверено',
    type: 'checkbox',
  },
  {
    id: 'mk-2',
    category: 'marketing',
    metric: 'Лиды за день сверены с CRM и источниками трафика',
    reportFormat: 'Число лидов + статус проверки',
    type: 'number',
    placeholder: 'Например, 128',
    suffix: 'лидов',
  },
  {
    id: 'mk-3',
    category: 'marketing',
    metric: 'Контент-план и публикации на сегодня готовы / опубликованы',
    reportFormat: 'Проверено / не проверено',
    type: 'checkbox',
  },
];

export const STATUS = {
  done: 'Проверено',
  skipped: 'Не проверено',
};
