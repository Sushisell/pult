/**
 * Google Apps Script для публикации таблицы в JSON-формате, который читает пульт.
 *
 * Как использовать:
 * 1. Откройте Google Sheets → Extensions / Расширения → Apps Script.
 * 2. Вставьте этот файл в Code.gs.
 * 3. Проверьте настройки колонок в CONFIG.
 * 4. Deploy / Развернуть → New deployment → Web app.
 * 5. Execute as: Me, Who has access: Anyone with the link.
 * 6. Скопируйте Web app URL в `window.PULT_DATA_URL` в `src/config.js`.
 */
const CONFIG = {
  infoSheetName: 'Инфо',
  dataSheetName: 'Данные',
  headerRows: 1,
  info: {
    // На листе «Инфо»: A = ФИО, B = роль сотрудника, C = роль руководителя.
    fullNameColumn: 1,
    roleColumn: 2,
    managerRoleColumn: 3,
  },
  metrics: {
    // На всех листах с метриками: A = периодичность, B = название, C = описание, D = цель,
    // F = должность ответственного, G = срок сдачи, I = классификация метрики, J = руководитель, которому нужен дашборд.
    frequencyColumn: 1,
    metricColumn: 2,
    descriptionColumn: 3,
    goalColumn: 4,
    roleColumn: 6,
    deadlineColumn: 7,
    classificationColumn: 9,
    managerRoleColumn: 10,
    // Необязательные колонки. Оставьте null, если их нет в таблице.
    reportFormatColumn: null,
    typeColumn: null,
    placeholderColumn: null,
    suffixColumn: null,
  },
};

function doGet() {
  const payload = buildWorkbookJson_();
  return jsonResponse_(payload);
}

function doPost(event) {
  const payload = JSON.parse((event && event.postData && event.postData.contents) || '{}');
  const rows = Array.isArray(payload.dataRows) ? payload.dataRows : [];
  writeDataRows_(rows);
  return jsonResponse_({ ok: true, saved: rows.length });
}

function buildWorkbookJson_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const infoSheet = spreadsheet.getSheetByName(CONFIG.infoSheetName);
  const dataSheet = spreadsheet.getSheetByName(CONFIG.dataSheetName);

  return {
    generatedAt: new Date().toISOString(),
    spreadsheetName: spreadsheet.getName(),
    infoRows: infoSheet ? readInfoRows_(infoSheet) : [],
    dataRows: dataSheet ? readDataRows_(dataSheet) : [],
    metricSheets: spreadsheet.getSheets()
      .filter((sheet) => ![CONFIG.infoSheetName, CONFIG.dataSheetName].includes(sheet.getName()))
      .map(readMetricSheet_)
      .filter((sheet) => sheet.rows.length > 0),
  };
}

function readInfoRows_(sheet) {
  return getDataRows_(sheet).map((row) => ({
    fullName: getCell_(row, CONFIG.info.fullNameColumn),
    role: getCell_(row, CONFIG.info.roleColumn),
    managerRole: getCell_(row, CONFIG.info.managerRoleColumn),
  })).filter((row) => row.fullName && row.role);
}

function readMetricSheet_(sheet) {
  return {
    name: sheet.getName(),
    rows: getDataRows_(sheet).map((row, index) => ({
      frequency: getCell_(row, CONFIG.metrics.frequencyColumn),
      metric: getCell_(row, CONFIG.metrics.metricColumn),
      description: getOptionalCell_(row, CONFIG.metrics.descriptionColumn),
      goal: getOptionalCell_(row, CONFIG.metrics.goalColumn),
      role: getCell_(row, CONFIG.metrics.roleColumn),
      deadline: getOptionalCell_(row, CONFIG.metrics.deadlineColumn),
      classification: getOptionalCell_(row, CONFIG.metrics.classificationColumn),
      managerRole: getOptionalCell_(row, CONFIG.metrics.managerRoleColumn),
      reportFormat: getOptionalCell_(row, CONFIG.metrics.reportFormatColumn) || getOptionalCell_(row, CONFIG.metrics.descriptionColumn) || 'Проверено / не проверено',
      type: getOptionalCell_(row, CONFIG.metrics.typeColumn) || getTypeByClassification_(getOptionalCell_(row, CONFIG.metrics.classificationColumn)),
      placeholder: getOptionalCell_(row, CONFIG.metrics.placeholderColumn),
      suffix: getOptionalCell_(row, CONFIG.metrics.suffixColumn),
      sourceRow: index + CONFIG.headerRows + 1,
    })).filter((row) => row.frequency && row.metric && row.role),
  };
}

function readDataRows_(sheet) {
  return getDataRows_(sheet).map((row) => ({
    date: getCell_(row, 1),
    owner: getCell_(row, 2),
    metric: getCell_(row, 3),
    value: getCell_(row, 4),
    comment: getCell_(row, 5),
  })).filter((row) => row.date && row.owner && row.metric);
}

function writeDataRows_(dataRows) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateDataSheet_(spreadsheet);
  const rowsByKey = new Map(readExistingDataRowIndexes_(sheet));

  dataRows.forEach((row) => {
    const values = [row.date, row.owner, row.metric, row.value, row.comment].map((value) => String(value ?? '').trim());
    if (!values[0] || !values[1] || !values[2]) return;
    const key = getDataRowKey_(values[0], values[1], values[2]);
    const existingRow = rowsByKey.get(key);
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
      rowsByKey.set(key, sheet.getLastRow());
    }
  });
}

function getOrCreateDataSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG.dataSheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.dataSheetName);
  if (sheet.getLastRow() === 0) sheet.appendRow(['Дата', 'ФИО', 'Метрика', 'Значение', 'Комментарий']);
  return sheet;
}

function readExistingDataRowIndexes_(sheet) {
  return getDataRows_(sheet).map((row, index) => [
    getDataRowKey_(getCell_(row, 1), getCell_(row, 2), getCell_(row, 3)),
    index + CONFIG.headerRows + 1,
  ]);
}

function getDataRowKey_(date, owner, metric) {
  return [date, owner, metric].map((value) => String(value ?? '').trim().toLowerCase()).join('||');
}

function getTypeByClassification_(classification) {
  const normalized = String(classification ?? '').trim().toLowerCase();
  if (normalized === 'ввод числа') return 'number';
  return 'checkbox';
}

function getDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow <= CONFIG.headerRows || lastColumn === 0) return [];
  return sheet
    .getRange(CONFIG.headerRows + 1, 1, lastRow - CONFIG.headerRows, lastColumn)
    .getDisplayValues();
}

function getOptionalCell_(row, columnNumber) {
  if (!columnNumber) return '';
  return getCell_(row, columnNumber);
}

function getCell_(row, columnNumber) {
  return String(row[columnNumber - 1] ?? '').trim();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
