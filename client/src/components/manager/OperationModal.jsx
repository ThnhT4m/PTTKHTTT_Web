import { useRef, useState } from 'react';
import { Modal, Field, Notice, labels } from '../shared';
import { manager } from '../../services/manager.js';
import { reasonError, OPERATION_STATES } from '../../utils/managerValidation.js';
import { ApiError } from '../../api/errors.js';
import { MutationFeedback } from './ResourceState';

export default function OperationModal({ type, item, remove, onDone, onClose, onReload, statusAction = manager.status }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const locked = useRef(false), [unknown, setUnknown] = useState(false);
  const states = type === 'slots' ? ['AVAILABLE', 'UNAVAILABLE'] : OPERATION_STATES;
  async function submit(event) {
    event.preventDefault(); if (locked.current || unknown) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    locked.current = true; setBusy(true); setError(null);
    try {
      const message = reasonError(values.reason);
      if (message) throw new ApiError({ message, code: 'VALIDATION_ERROR' }, 400);
      await (remove ? manager.remove(type, item, values.reason.trim()) : statusAction(type, item, values.status, values.reason.trim()));
      onDone(remove ? 'Đã xóa mềm. Bản ghi và lịch sử vẫn được giữ; bạn có thể kích hoạt lại.' : 'Đã cập nhật trạng thái và ghi nhận lý do.');
    } catch (err) { setError(err); if (err.kind === 'network' || err.status >= 500) setUnknown(true); } finally { locked.current = false; setBusy(false); }
  }
  return <Modal title={remove ? 'Xác nhận xóa mềm' : 'Đổi trạng thái vận hành'} onClose={() => { if (!busy) onClose(); }}>
    <p><strong>{item.name || `${item.start_time.slice(0, 5)} – ${item.end_time.slice(0, 5)}`}</strong></p>
    <MutationFeedback error={error} onReload={onReload} />
    {unknown && <Notice type="info">Chưa xác định kết quả. Đóng biểu mẫu và tải lại dữ liệu để kiểm tra trước khi gửi thao tác mới.</Notice>}
    <Notice type="info">{remove ? 'Cơ sở hoặc sân sẽ chuyển sang ngừng hoạt động. Không xóa bản ghi, slot, booking hoặc lịch sử.' : 'Ca HELD/BOOKED và các đơn hiệu lực được bảo vệ. Cơ sở/sân còn đơn PENDING/CONFIRMED chưa kết thúc phải xử lý đơn trước khi ngưng hoạt động.'}</Notice>
    <form className="form-stack" onSubmit={submit}><fieldset className="manager-form" disabled={busy || unknown}>
      {!remove && <Field label="Trạng thái mới"><select className="input" name="status" defaultValue={states.includes(item.status) ? item.status : states[0]}>{states.map((s) => <option key={s} value={s}>{labels[s]}</option>)}</select></Field>}
      <Field label="Lý do"><textarea className="input" name="reason" minLength={5} maxLength={1000} required autoFocus placeholder="Nêu rõ lý do thay đổi" /></Field>
      <div className="form-actions"><button className="button button--secondary" type="button" onClick={onClose}>Đóng</button><button className={`button button--${remove ? 'danger' : 'primary'}`} disabled={busy}>{busy ? 'Đang xử lý…' : remove ? 'Xác nhận xóa mềm' : 'Xác nhận thay đổi'}</button></div>
    </fieldset></form>
  </Modal>;
}
