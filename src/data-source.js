import { createCatalog } from './checklist.js?v=0.1.47';

const DEFAULT_DATA_URL = './data/workbook.json';
export const DEFAULT_LOAD_TIMEOUT_MS = 60_000;
export const DEFAULT_SUBMIT_TIMEOUT_MS = 60_000;
export const DEFAULT_LOAD_RETRY_COUNT = 2;
export const DEFAULT_LOAD_RETRY_DELAY_MS = 1_500;

export async function loadCatalog({
  dataUrl = globalThis.window?.PULT_DATA_URL ?? DEFAULT_DATA_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  retryCount = DEFAULT_LOAD_RETRY_COUNT,
  retryDelayMs = DEFAULT_LOAD_RETRY_DELAY_MS,
} = {}) {
  if (!dataUrl || typeof fetchImpl !== 'function') {
    return createCatalog();
  }

  try {
    const response = await fetchWithRetries(fetchImpl, getReadUrl(dataUrl, 'catalog'), { cache: 'no-store' }, {
      timeoutMs,
      retryCount,
      retryDelayMs,
    });
    const workbook = await response.json();
    return createCatalog(workbook);
  } catch (error) {
    console.warn('Таблица не загрузилась. Демо-данные отключены, поэтому каталог останется пустым.', error);
    return createCatalog();
  }
}

export async function loadDataRows({
  dataUrl = globalThis.window?.PULT_DATA_URL ?? DEFAULT_DATA_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  retryCount = DEFAULT_LOAD_RETRY_COUNT,
  retryDelayMs = DEFAULT_LOAD_RETRY_DELAY_MS,
} = {}) {
  if (!isWritableDataUrl(dataUrl) || typeof fetchImpl !== 'function') {
    return [];
  }

  try {
    const response = await fetchWithRetries(fetchImpl, getReadUrl(dataUrl, 'data'), { cache: 'no-store' }, {
      timeoutMs,
      retryCount,
      retryDelayMs,
    });
    const payload = await response.json();
    return Array.isArray(payload.dataRows) ? payload.dataRows : [];
  } catch (error) {
    console.warn('Лист Данные не загрузился. История отчётов появится после следующей успешной загрузки.', error);
    return [];
  }
}

export async function submitDataRows(dataRows, {
  dataUrl = globalThis.window?.PULT_DATA_URL ?? DEFAULT_DATA_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_SUBMIT_TIMEOUT_MS,
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

function getReadUrl(dataUrl, mode) {
  if (!isWritableDataUrl(dataUrl)) return dataUrl;
  const url = new URL(dataUrl);
  url.searchParams.set('mode', mode);
  return url.toString();
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

async function fetchWithRetries(fetchImpl, url, options, {
  timeoutMs,
  retryCount,
  retryDelayMs,
}) {
  const attempts = Math.max(1, Number(retryCount) + 1);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(fetchImpl, url, options, timeoutMs);
      if (response.ok) return response;
      lastError = new Error(`Не удалось загрузить данные: ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts && retryDelayMs > 0) {
      await delay(retryDelayMs);
    }
  }

  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
