import { useRef, useState } from 'react';
import { Modal, Notice, Field, BookingSummary, money, timeVN, todayVN, StatusBadge } from '../shared';
import { useCustomerResource, useServerNow } from '../../hooks/useCustomerResource.js';
import { customer } from '../../services/customer.js';
import { canReschedule, canRequestRefund, canReview } from '../../utils/customer.js';
import { reasonError } from '../../utils/managerValidation.js';
import { CustomerResource } from './ResourceState';

function ActionError({ error, onReload, unknown }) {
  if (!error) return null;
  return <><Notice>{error}</Notice>{unknown && <Notice type="info">Kết quả chưa xác định. Hãy đóng biểu mẫu và làm mới lịch sử để kiểm tra trước khi gửi lại.</Notice>}{onReload && <button className="button button--secondary" type="button" onClick={onReload}>Tải lại dữ liệu để kiểm tra</button>}</>;
}
export function CustomerReschedule({ booking, onClose, onDone }) {
  const [date, setDate] = useState(todayVN()), [courtId, setCourtId] = useState(booking.court_id), [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [unknown, setUnknown] = useState(false), locked = useRef(false);
  const originalCourt = useCustomerResource(`/courts/${booking.court_id}`);
  const courts = useCustomerResource(`/venues/${booking.venue_id}/courts#reschedule`, { load: (options) => customer.courts(booking.venue_id, options) });
  const slots = useCustomerResource(courtId && date ? `/courts/${courtId}/slots?date=${date}` : null);
  const now = useServerNow(slots.offset), sport = booking.sport_type || originalCourt.data?.sport_type;
  const choices = (courts.data || []).filter((c) => c.status === 'ACTIVE' && c.sport_type === sport);
  const available = (slots.data || []).filter((s) => s.status === 'AVAILABLE' && Date.parse(s.start_at) > now && Number(s.price) === Number(booking.total_amount) && s.id !== booking.time_slot_id && choices.some((c) => c.id === s.court_id));
  async function submit(event) {
    event.preventDefault(); if (locked.current || !available.some((s) => s.id === target) || !canReschedule(booking, now) || unknown) return;
    const reason = new FormData(event.currentTarget).get('reason');
    if (reasonError(reason)) { setError(reasonError(reason)); return; }
    locked.current = true; setBusy(true); setError('');
    try { await customer.reschedule(booking.id, { new_time_slot_id: target, reason: reason.trim(), is_venue_issue: !!booking.issue_reported_at }); onDone('Đã dời lịch. Booking và lịch sử đã được tải lại.'); }
    catch (err) { setError(err.message); if (err.kind === 'network' || err.status >= 500) setUnknown(true); else { slots.reload(); setTarget(''); } }
    finally { locked.current = false; setBusy(false); }
  }
  return <Modal title="Dời lịch đặt sân" onClose={() => { if (!busy) onClose(); }}><BookingSummary booking={booking} /><ActionError error={error} unknown={unknown} onReload={() => { slots.reload(); courts.reload(); setTarget(''); }} />
    <Notice type="info">Chọn ca trống trong tương lai, cùng cơ sở, bộ môn và giá. {booking.issue_reported_at ? 'Cơ sở đã báo sự cố; ca cũ tiếp tục ngưng phục vụ.' : 'Dời tự nguyện chỉ thực hiện trước giờ bắt đầu ca cũ.'}</Notice>
    {!canReschedule(booking, now) && <Notice>Booking không còn đủ điều kiện dời lịch.</Notice>}
    {originalCourt.error && <Notice>{originalCourt.error.message}</Notice>}
    <form className="form-stack" onSubmit={submit}><fieldset className="customer-form" disabled={busy}>
      <div className="form-grid"><Field label="Ngày mới"><input className="input" type="date" value={date} min={todayVN(now)} required onChange={(e) => { setDate(e.target.value); setTarget(''); }} /></Field><Field label="Sân mới"><select className="input" value={courtId} onChange={(e) => { setCourtId(e.target.value); setTarget(''); }}>{choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div>
      <CustomerResource resource={courts} empty="Chưa có sân phù hợp."><CustomerResource resource={slots} empty="Chưa có lịch trong ngày này."><Field label="Ca còn trống cùng giá"><select className="input" name="new_time_slot_id" value={target} required onChange={(e) => setTarget(e.target.value)}><option value="">Chọn ca mới</option>{available.map((s) => <option key={s.id} value={s.id}>{timeVN(s.start_at)} – {timeVN(s.end_at)} · {money(s.price)}</option>)}</select></Field>{!available.length && <p className="muted">Không có ca đủ điều kiện. Hãy chọn ngày khác.</p>}</CustomerResource></CustomerResource>
      <Field label="Lý do"><textarea className="input" name="reason" minLength={5} maxLength={1000} required /></Field><button className="button button--primary" disabled={busy || unknown || !available.some((s) => s.id === target) || !canReschedule(booking, now)}>{busy ? 'Đang dời lịch…' : 'Xác nhận dời lịch'}</button>
    </fieldset></form>
  </Modal>;
}
export function CustomerRefund({ booking, onClose, onDone }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), locked = useRef(false);
  async function confirm() {
    if (locked.current || !canRequestRefund(booking)) return;
    locked.current = true; setBusy(true); setError('');
    try { const { data } = await customer.refund(booking.id); onDone(`Đã gửi yêu cầu hoàn tiền (${data.status === 'REQUESTED' ? 'Chờ duyệt' : data.status}).`); }
    catch (err) { setError(err.message); } finally { locked.current = false; setBusy(false); }
  }
  return <Modal title="Xác nhận yêu cầu hoàn tiền" onClose={() => { if (!busy) onClose(); }}><BookingSummary booking={booking} /><Notice type="info">Sự cố đã được cơ sở ghi nhận: {booking.issue_reason || 'Có sự cố sân'}. Yêu cầu hoàn toàn phần được gửi để chờ xử lý; thao tác này chưa chuyển tiền.</Notice><p>Số tiền yêu cầu: <strong>{money(booking.total_amount)}</strong></p><StatusBadge status="REQUESTED" refund /><ActionError error={error} /><div className="form-actions"><button className="button button--secondary" disabled={busy} onClick={onClose}>Đóng</button><button className="button button--primary" disabled={busy || !canRequestRefund(booking)} onClick={confirm}>{busy ? 'Đang gửi…' : 'Xác nhận yêu cầu hoàn tiền'}</button></div></Modal>;
}
export function CustomerReview({ booking, onClose, onDone }) {
  const [rating, setRating] = useState(5), [busy, setBusy] = useState(false), [error, setError] = useState(''), [unknown, setUnknown] = useState(false), locked = useRef(false);
  async function submit(event) {
    event.preventDefault(); if (locked.current || !canReview(booking) || unknown) return;
    locked.current = true; setBusy(true); setError('');
    try { await customer.review(booking.id, { rating, comment: new FormData(event.currentTarget).get('comment') || '' }); onDone('Đã gửi đánh giá. Cảm ơn bạn!'); }
    catch (err) { setError(err.message); if (err.kind === 'network' || err.status >= 500) setUnknown(true); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Modal title="Đánh giá trải nghiệm của bạn" onClose={() => { if (!busy) onClose(); }}><ActionError error={error} unknown={unknown} /><form className="form-stack" onSubmit={submit}><fieldset className="customer-form" disabled={busy}>
    <fieldset className="customer-rating"><legend>Mức độ hài lòng</legend><div className="customer-stars">{[1, 2, 3, 4, 5].map((value) => <label key={value}><input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} />{value} ★</label>)}</div></fieldset><Field label="Bình luận (tùy chọn)"><textarea className="input" name="comment" maxLength={2000} /></Field><button className="button button--primary" disabled={busy || unknown || !canReview(booking)}>{busy ? 'Đang gửi…' : 'Gửi đánh giá'}</button>
  </fieldset></form></Modal>;
}
