export const CHECKLIST = [
  {
    id: 1,
    metric: 'Проверка работы карьерного сайта: форма отправляет лид, лиды приходят в CRM',
    reportFormat: 'Отметка «проверено» в чек-листе Bitrix',
    type: 'checkbox',
  },
  {
    id: 2,
    metric: 'Проверка ЛК Avito: баланс, активные вакансии, обработка откликов рекрутерами',
    reportFormat: 'Отметка «проверено»',
    type: 'checkbox',
  },
  {
    id: 3,
    metric: 'Проверка ЛК hh: вакансии активны, поднятия по плану, баланс',
    reportFormat: 'Отметка «проверено» в чек-листе',
    type: 'checkbox',
  },
  {
    id: 11,
    metric: 'Ежедневный контроль индекса вежливости компании на HH',
    reportFormat: 'Ввод числа',
    type: 'number',
    placeholder: 'Например, 94',
    suffix: '%',
  },
  {
    id: 5,
    metric: 'Saby работает + плановые приказы дня проведены (отпуска, приёмы, увольнения)',
    reportFormat: 'Отчёт «0 непроведённых» в задаче',
    type: 'checkbox',
  },
  {
    id: 6,
    metric: 'Проверка LMS: новички назначены на стартовый курс, активность идёт',
    reportFormat: 'Отметка «проверено» + список не активных',
    type: 'checkboxWithText',
    placeholder: 'Кто не активен?',
  },
];

export const STATUS = {
  done: 'Проверено',
  issue: 'Есть проблема',
  skipped: 'Не проверено',
};
