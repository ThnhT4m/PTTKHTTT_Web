import { Empty, Loading, Notice } from '../shared';
export function CustomerResource({ resource, empty = 'Chưa có dữ liệu.', children }) {
  if (resource.loading) return <Loading />;
  if (resource.error) return <><Notice>{resource.error.message}</Notice><button type="button" className="button button--secondary" onClick={resource.reload}>Thử lại</button></>;
  if (!resource.data || (Array.isArray(resource.data) && !resource.data.length)) return <Empty>{empty}</Empty>;
  return children;
}
export function Pagination({ offset, count, limit = 12, onChange, loading = false }) {
  if (offset === 0 && count < limit) return null;
  return <nav className="customer-pagination" aria-label="Phân trang"><button className="button button--secondary" disabled={loading || offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Trang trước</button><span>Trang {Math.floor(offset / limit) + 1}</span><button className="button button--secondary" disabled={loading || count < limit} onClick={() => onChange(offset + limit)}>Trang sau</button></nav>;
}
