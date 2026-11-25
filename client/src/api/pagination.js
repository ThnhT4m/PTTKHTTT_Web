import { ApiError } from './errors.js';
import { query } from './http.js';

export async function readPages(get, path, { signal, pageSize = 300 } = {}) {
  const rows = [];
  for (let offset = 0; offset <= 1000000; offset += pageSize) {
    signal?.throwIfAborted();
    const { data } = await get(`${path}${path.includes('?') ? '&' : '?'}${query({ limit: pageSize, offset })}`, { signal });
    if (!Array.isArray(data)) throw new ApiError({ code: 'INVALID_RESPONSE', message: 'Danh sách trả về không đúng Contract.' }, 200);
    rows.push(...data);
    if (data.length < pageSize) return { data: rows };
  }
  throw new ApiError({ code: 'PAGINATION_LIMIT', message: 'Danh sách vượt giới hạn phân trang. Vui lòng thu hẹp phạm vi.' }, 400);
}
