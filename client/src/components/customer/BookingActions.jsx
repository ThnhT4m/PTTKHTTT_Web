import { useRef, useState } from 'react';
import { Modal, Notice, Field, BookingSummary, money, StatusBadge } from '../shared';
import { customer } from '../../services/customer.js';
import { canRequestRefund, canReview } from '../../utils/customer.js';

function ActionError({ error, onReload, unknown }) {
  if (!error) return null;
  return <><Notice>{error}</Notice>{unknown && <Notice type="info">Kết quả chưa xác định. Hãy đóng biểu mẫu và làm mới lịch sử để kiểm tra trước khi gửi lại.</Notice>}{onReload && <button className="button button--secondary" type="button" onClick={onReload}>Tải lại dữ liệu để kiểm tra</button>}</>;
}
export { default as CustomerReschedule } from '../workflows/RescheduleModal';
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
