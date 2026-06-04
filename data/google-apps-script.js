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
  headerRows: 1,
  info: {
    // На листе «Инфо»: A = ФИО, B = роль сотрудника, C = роль руководителя.
    fullNameColumn: 1,
    roleColumn: 2,
    managerRoleColumn: 3,
  },
  metrics: {
    // На всех листах с метриками: A = периодичность, B = название, C = описание, D = цель,
    // F = должность ответственного, J = руководитель, которому нужен дашборд.
    frequencyColumn: 1,
    metricColumn: 2,
    descriptionColumn: 3,
    goalColumn: 4,
    roleColumn: 6,
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
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildWorkbookJson_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const infoSheet = spreadsheet.getSheetByName(CONFIG.infoSheetName);

  return {
    generatedAt: new Date().toISOString(),
    spreadsheetName: spreadsheet.getName(),
    infoRows: infoSheet ? readInfoRows_(infoSheet) : [],
    metricSheets: spreadsheet.getSheets()
      .filter((sheet) => sheet.getName() !== CONFIG.infoSheetName)
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
      managerRole: getOptionalCell_(row, CONFIG.metrics.managerRoleColumn),
      reportFormat: getOptionalCell_(row, CONFIG.metrics.reportFormatColumn) || getOptionalCell_(row, CONFIG.metrics.descriptionColumn) || 'Проверено / не проверено',
      type: getOptionalCell_(row, CONFIG.metrics.typeColumn) || 'checkbox',
      placeholder: getOptionalCell_(row, CONFIG.metrics.placeholderColumn),
      suffix: getOptionalCell_(row, CONFIG.metrics.suffixColumn),
      sourceRow: index + CONFIG.headerRows + 1,
    })).filter((row) => row.frequency && row.metric && row.role),
  };
}

function getDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow <= CONFIG.headerRows || lastColumn === 0) return [];
  return sheet
    .getRange(CONFIG.headerRows + 1, 1, lastRow - CONFIG.headerRows, lastColumn)
    .getValues();
}

function getOptionalCell_(row, columnNumber) {
  if (!columnNumber) return '';
  return getCell_(row, columnNumber);
}

function getCell_(row, columnNumber) {
  return String(row[columnNumber - 1] ?? '').trim();
}
