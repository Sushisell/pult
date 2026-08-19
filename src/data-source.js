import { createCatalog } from './checklist.js?v=0.1.40';

const DEFAULT_DATA_URL = './data/workbook.json';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export async function loadCatalog({
  dataUrl = globalThis.window?.PULT_DATA_URL ?? DEFAULT_DATA_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  if (!dataUrl || typeof fetchImpl !== 'function') {
    return createCatalog();
  }

  try {
    const response = await fetchWithTimeout(fetchImpl, dataUrl, { cache: 'no-store' }, timeoutMs);
    if (!response.ok) throw new Error(`Не удалось загрузить данные: ${response.status}`);
    const workbook = await response.json();
    return createCatalog(workbook);
  } catch (error) {
    console.warn('Таблица не загрузилась. Демо-данные отключены, поэтому каталог останется пустым.', error);
    return createCatalog();
  }
}

export async function submitDataRows(dataRows, {
  dataUrl = globalThis.window?.PULT_DATA_URL ?? DEFAULT_DATA_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  if (!isWritableDataUrl(dataUrl) || typeof fetchImpl !== 'function' || dataRows.length === 0) {
    return { skipped: true };
  }

  await fetchWithTimeout(fetchImpl, dataUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({ dataRows }),
  }, timeoutMs);

  return { skipped: false };
}

function isWritableDataUrl(dataUrl) {
  return /^https?:\/\//i.test(String(dataUrl ?? ''));
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortController !== 'function') {
    return fetchImpl(url, options);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
