import { Loading, Notice, Empty } from '../shared';
export function ResourceState({ resource, empty = 'Chưa có dữ liệu.', children }) {
  if (resource.loading) return <Loading />;
  if (resource.error) return (
    <><Notice>{resource.error.status === 403 ? 'Bạn không có quyền quản lý dữ liệu này. ' : ''}{resource.error.message}</Notice>
      <button className="button button--secondary" onClick={resource.reload}>Tải lại dữ liệu</button></>
  );
  if (!resource.data || (Array.isArray(resource.data) && !resource.data.length)) return <Empty>{empty}</Empty>;
  return children;
}
export function MutationFeedback({ error, onReload }) {
  if (!error) return null;
  return <>
    <Notice>{error?.status === 403 ? 'Thao tác bị từ chối vì không thuộc phạm vi quản lý. ' : ''}{error?.message}</Notice>
    {error?.status === 409 && <div className="manager-tools">
      <p className="muted">Tải lại để kiểm tra dữ liệu và các đơn liên quan, rồi mở lại thao tác để xác nhận.</p>
      <button type="button" className="button button--secondary" onClick={onReload}>Tải lại dữ liệu mới</button>
    </div>}
  </>;
}
