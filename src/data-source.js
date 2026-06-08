import { INFO_ROWS, METRIC_SHEETS, createCatalog } from './checklist.js';

const DEFAULT_DATA_URL = './data/workbook.json';

export async function loadCatalog({
  dataUrl = globalThis.window?.PULT_DATA_URL ?? DEFAULT_DATA_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!dataUrl || typeof fetchImpl !== 'function') {
    return createCatalog({ infoRows: INFO_ROWS, metricSheets: METRIC_SHEETS });
  }

  try {
    const response = await fetchImpl(dataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Не удалось загрузить данные: ${response.status}`);
    const workbook = await response.json();
    return createCatalog(workbook);
  } catch (error) {
    console.warn('Используем демо-данные, потому что таблица не загрузилась.', error);
    return createCatalog({ infoRows: INFO_ROWS, metricSheets: METRIC_SHEETS });
  }
}

export async function submitDataRows(dataRows, {
  dataUrl = globalThis.window?.PULT_DATA_URL ?? DEFAULT_DATA_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!isWritableDataUrl(dataUrl) || typeof fetchImpl !== 'function' || dataRows.length === 0) {
    return { skipped: true };
  }

  await fetchImpl(dataUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({ dataRows }),
  });

  return { skipped: false };
}

function isWritableDataUrl(dataUrl) {
  return /^https?:\/\//i.test(String(dataUrl ?? ''));
}
