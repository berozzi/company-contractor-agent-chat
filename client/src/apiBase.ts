/**
 * Sciezka API jest zawsze /api - niezaleznie od tego, jak uzupelniona zostanie
 * zmienna API_URL na Vercelu. Dzieki temu adres bez "/api" na koncu nie psuje
 * frontendu, bo dokladnie ten sam blad najczesciej tlumaczyl sie bledem CORS.
 */
export const API_PATH = '/api';

export function resolveApiBaseUrl(configuredUrl: string | undefined | null): string {
  const trimmed = (configuredUrl ?? '').trim().replace(/\/+$/, '');

  if (!trimmed) {
    return API_PATH;
  }

  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}${API_PATH}`;
}
