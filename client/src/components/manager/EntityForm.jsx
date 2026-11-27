import { useRef, useState } from 'react';
import { Field, Modal, Notice, SPORTS } from '../shared';
import { manager } from '../../services/manager.js';
import { ApiError } from '../../api/errors.js';
import { MAX_PRICE, metadataErrors } from '../../utils/managerValidation.js';
import { MutationFeedback } from './ResourceState';

export default function EntityForm({ type, item, venueId, onClose, onDone, onReload }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const locked = useRef(false);
  const [unknown, setUnknown] = useState(false);
  const isVenue = type === 'venues', title = `${item ? 'Chỉnh sửa' : 'Thêm'} ${isVenue ? 'cơ sở' : 'sân'}`;
  async function submit(event) {
    event.preventDefault();
    if (locked.current || unknown) return;
    locked.current = true;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    for (const key of isVenue ? ['payment_hold_minutes', 'minimum_online_booking_lead_minutes'] : ['hourly_price']) values[key] = Number(values[key]);
    setBusy(true); setError(null);
    try {
      const errors = metadataErrors(type, values);
      if (Object.keys(errors).length) throw new ApiError({ code: 'VALIDATION_ERROR', message: Object.values(errors)[0], details: errors }, 400);
      const result = await (isVenue ? manager.saveVenue(item, values) : manager.saveCourt(venueId, item, values));
      onDone(`Đã ${item ? 'cập nhật' : 'thêm'} ${isVenue ? 'cơ sở' : 'sân'}.`, result.data);
    } catch (err) {
      if (err.kind === 'network' || !err.status || err.status >= 500) setUnknown(true);
      setError(err);
    } finally { locked.current = false; setBusy(false); }
  }
  return <Modal title={title} onClose={() => { if (!busy) onClose(); }}>
    <MutationFeedback error={error} onReload={onReload} />
    {unknown && <Notice>Chưa xác định được kết quả lưu. Đóng biểu mẫu và tải lại danh sách để kiểm tra trước khi thao tác tiếp; không gửi lại yêu cầu này.</Notice>}
    <form className="form-stack" onSubmit={submit}>
      <fieldset className="manager-form" disabled={busy || unknown}>
        <Field label={isVenue ? 'Tên cơ sở' : 'Tên sân'}><input className="input" name="name" required minLength={2} maxLength={isVenue ? 150 : 120} defaultValue={item?.name} autoFocus /></Field>
        {isVenue ? <>
          <Field label="Địa chỉ"><input className="input" name="address" required minLength={3} maxLength={300} defaultValue={item?.address} /></Field>
          <Field label="Quận / huyện"><input className="input" name="district" required maxLength={100} defaultValue={item?.district} /></Field>
          <div className="form-grid">
            <Field label="Thời gian giữ chỗ (phút)" hint="Số nguyên từ 1 đến 10."><input className="input" name="payment_hold_minutes" type="number" min={1} max={10} step={1} required defaultValue={item?.payment_hold_minutes ?? 5} /></Field>
            <Field label="Đặt online trước (phút)" hint="Ít nhất 10 phút trước giờ bắt đầu."><input className="input" name="minimum_online_booking_lead_minutes" type="number" min={10} max={1440} step={1} required defaultValue={item?.minimum_online_booking_lead_minutes ?? 10} /></Field>
          </div>
        </> : <div className="form-grid">
          <Field label="Bộ môn"><select className="input" name="sport_type" defaultValue={item?.sport_type || 'FOOTBALL'}>{Object.entries(SPORTS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field>
          <Field label="Giá mặc định (VND)"><input className="input" name="hourly_price" type="number" min={0} max={MAX_PRICE} step={1} required defaultValue={item?.hourly_price ?? 100000} /></Field>
        </div>}
        <Field label="Mô tả"><textarea className="input" name="description" maxLength={2000} defaultValue={item?.description || ''} /></Field>
        {!isVenue && <Notice type="info">Giá mặc định chỉ áp dụng cho các ca sinh mới. Giá ca đã tồn tại và giá booking đã tạo được giữ nguyên.</Notice>}
        <div className="form-actions"><button className="button button--secondary" type="button" onClick={onClose}>Đóng</button><button className="button button--primary" disabled={busy || unknown}>{busy ? 'Đang lưu…' : 'Lưu thông tin'}</button></div>
      </fieldset>
    </form>
  </Modal>;
}
