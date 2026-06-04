export const CATEGORIES = [
  { id: 'hr', label: 'HR', icon: '👥' },
  { id: 'franchise', label: 'Франчайзинг', icon: '🤝' },
  { id: 'marketing', label: 'Маркетинг', icon: '📣' },
];

export const CHECKLIST = [
  {
    id: 'hr-1',
    category: 'hr',
    metric: 'Проверка работы карьерного сайта',
    reportFormat: 'Форма отправляет лид, лиды приходят в CRM',
    type: 'checkbox',
  },
  {
    id: 'hr-2',
    category: 'hr',
    metric: 'Проверка ЛК Avito',
    reportFormat: 'Баланс, активные вакансии, обработка откликов рекрутерами',
    type: 'checkbox',
  },
  {
    id: 'hr-3',
    category: 'hr',
    metric: 'Проверка ЛК hh',
    reportFormat: 'Вакансии активны, поднятия по плану, баланс',
    type: 'checkbox',
  },
  {
    id: 'hr-4',
    category: 'hr',
    metric: 'Ежедневный контроль индекса вежливости компании на HH',
    reportFormat: 'Введите текущее значение индекса',
    type: 'number',
    placeholder: 'Например, 94',
    suffix: '%',
  },
  {
    id: 'hr-5',
    category: 'hr',
    metric: 'Saby работает + плановые приказы дня проведены',
    reportFormat: 'Отпуска, приёмы, увольнения',
    type: 'checkbox',
  },
  {
    id: 'hr-6',
    category: 'hr',
    metric: 'Проверка LMS',
    reportFormat: 'Новички назначены на стартовый курс, активность идёт',
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
  done: 'Всё ок',
  issue: 'Найдены проблемы',
  skipped: 'Не проверено',
};
