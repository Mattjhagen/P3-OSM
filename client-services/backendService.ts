export const BACKEND_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://localhost:3001';

export const backendFetch = (path: string, options?: RequestInit) => {
  const url = path.startsWith('http') ? path : `${BACKEND_URL}${path}`;
  return options ? fetch(url, options) : fetch(url);
};
