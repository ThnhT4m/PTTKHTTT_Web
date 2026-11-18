import { useEffect, useState } from 'react';
import { get, post } from '../api/client';
import { Modal, Notice, Field, Loading, money, todayVN, timeVN, errorMessage } from './shared';
export function RescheduleModal({ booking, onClose, onDone }) {
  const [date, setDate] = useState(todayVN());
  const [courts, setCourts] = useState([]);
  const [courtId, setCourtId] = useState(booking.court_id);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    get(`/venues/${booking.venue_id}`)
      .then((r) =>
        setCourts(
          (r.data.courts || []).filter(
            (c) =>
              c.status === 'ACTIVE' && (!booking.sport_type || c.sport_type === booking.sport_type),
          ),
        ),
      )
      .catch((e) => setError(e.message));
  }, [booking.venue_id, booking.sport_type]);
  useEffect(() => {
    if (!courtId || !date) return;
    let mounted = true;
    setLoading(true);
    setSlots([]);
    setError('');
    get(`/courts/${courtId}/slots?date=${date}`)
      .then((r) => {
        if (mounted)
          setSlots(
            r.data.filter(
              (s) =>
                s.status === 'AVAILABLE' &&
                Number(s.price) === Number(booking.total_amount) &&
                new Date(s.start_at) > new Date(),
            ),
          );
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [courtId, date, booking.total_amount]);
  async function submit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      await post(`/bookings/${booking.id}/reschedule`, {
        ...body,
        is_venue_issue: !!booking.issue_reported_at,
      });
      onDone('Đã dời lịch thành công.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Dời lịch đặt sân" onClose={onClose}>
      <Notice>{error}</Notice>
      <Notice type="info">
        Bạn có thể dời trong cùng cơ sở, cùng bộ môn và cùng giá. Sân cũ có sự cố sẽ tiếp tục được
        khóa.
      </Notice>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Ngày mới">
            <input
              className="input"
              type="date"
              value={date}
              min={todayVN()}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Sân">
            <select className="input" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
              {courts.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {loading ? (
          <Loading />
        ) : (
          <Field label="Khung giờ còn trống cùng giá">
            <select className="input" name="new_time_slot_id" required defaultValue="">
              <option value="">Chọn khung giờ</option>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.start_time?.slice(0, 5) || timeVN(s.start_at)} –{' '}
                  {s.end_time?.slice(0, 5) || timeVN(s.end_at)} · {money(s.price)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Lý do">
          <textarea
            className="input"
            name="reason"
            minLength={5}
            maxLength={1000}
            required
            placeholder="Nhập lý do dời lịch"
          />
        </Field>
        <div className="form-actions">
          <button type="button" onClick={onClose} className="button button--secondary">
            Đóng
          </button>
          <button className="button button--primary" disabled={busy || loading || !slots.length}>
            {busy ? 'Đang xử lý…' : 'Xác nhận dời lịch'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ReviewModal({ booking, onClose, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      await post(`/bookings/${booking.id}/reviews`, {
        rating: Number(form.rating),
        comment: form.comment,
      });
      onDone('Cảm ơn bạn đã đánh giá sân!');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Đánh giá trải nghiệm của bạn" onClose={onClose}>
      <Notice>{error}</Notice>
      <form onSubmit={submit} className="form-stack">
        <Field label="Mức độ hài lòng">
          <select name="rating" className="input" defaultValue="5">
            {[5, 4, 3, 2, 1].map((n) => (
              <option value={n} key={n}>
                {'★'.repeat(n)} · {n} sao
              </option>
            ))}
          </select>
        </Field>
        <Field label="Chia sẻ thêm">
          <textarea
            className="input"
            name="comment"
            maxLength={2000}
            placeholder="Chất lượng sân, dịch vụ, trải nghiệm…"
          />
        </Field>
        <button className="button button--primary" disabled={busy}>
          {busy ? 'Đang gửi…' : 'Gửi đánh giá'}
        </button>
      </form>
    </Modal>
  );
}
