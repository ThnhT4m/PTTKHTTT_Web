import { createApiClient, createHttpTransport } from './http.js';
import { createSession } from './session.js';
export { ApiError } from './errors.js';
export { query } from './http.js';

export const DATA_MODE = import.meta.env.VITE_DATA_MODE || 'api';
if (!['api', 'mock'].includes(DATA_MODE)) throw new Error('VITE_DATA_MODE phải là api hoặc mock.');
export const session = createSession(DATA_MODE);
// Select before fetch: mock never falls back to a real backend.
let mockTransport;
const transport = DATA_MODE === 'mock'
  ? async (path, options) => {
      mockTransport ||= import('../mocks/handler.js').then(({ createMockTransport }) =>
        createMockTransport({ storage: globalThis.localStorage }));
      return (await mockTransport)(path, options);
    }
  : createHttpTransport(import.meta.env.VITE_API_BASE || '/api');
const client = createApiClient({
  transport, session,
  onExpired: () => globalThis.window?.dispatchEvent(new Event('auth:expired')),
});
export const { request, get, post, patch, del } = client;
