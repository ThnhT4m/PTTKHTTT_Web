import { useRef, useState } from 'react';
import { Modal, Notice } from '../shared';
export default function ActionModal({
  title,
  children,
  action,
  onDone,
  onClose,
  submitLabel = 'Xác nhận',
  validate,
  onReload,
  disabled = false
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [unknown, setUnknown] = useState(false),
    locked = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (locked.current || unknown || disabled) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const message = validate?.(values);
      if (message) {
        setError({
          message
        });
        return;
      }
      const result = await action(values);
      onDone(result?.data);
    } catch (err) {
      setError(err);
      if (err.kind === 'network' || err.status >= 500) setUnknown(true);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return <Modal title={title} onClose={() => {
    if (!busy) onClose();
  }}>
    {error && <Notice>{error.status === 403 ? 'Không có quyền xử lý dữ liệu này. ' : ''}{error.message}</Notice>}
    {unknown && <Notice type="info">Chưa xác định kết quả. Đóng biểu mẫu và tải lại dữ liệu để kiểm tra trước khi gửi thao tác mới.</Notice>}
    {error?.status === 409 && onReload && <button type="button" className="button button--secondary" onClick={onReload}>Tải lại dữ liệu để kiểm tra</button>}
    <form className="form-stack" onSubmit={submit}>
      <fieldset className="workflow-form" disabled={busy || unknown}>
        {children}
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>Đóng</button>
          <button className="button button--primary" disabled={busy || unknown || disabled}>{busy ? 'Đang xử lý…' : submitLabel}</button>
        </div>
      </fieldset>
    </form>
  </Modal>;
}
