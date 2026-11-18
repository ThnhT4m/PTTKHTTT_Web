import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock3, MapPin } from 'lucide-react';
import { post } from '../../api/client';
import {
  useResource,
  PageHeader,
  Loading,
  Notice,
  Empty,
  StatusBadge,
  money,
  dateVN,
  timeVN,
} from '../../components/shared';
import { RescheduleModal, ReviewModal } from '../../components/BookingActions';
export default function MyBookingsPage() {
  const { data, loading, error, reload } = useResource('/bookings');
  const [tab, setTab] = useState('ALL');
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const bookings = (data || []).filter((b) => tab === 'ALL' || b.status === tab);
  function done(msg) {
    setModal(null);
    setMessage(msg);
    reload();
  }
  async function requestRefund(b) {
    setBusy(b.id);
    setActionError('');
    try {
      await post(`/bookings/${b.id}/refund-request`);
      done('Đã gửi yêu cầu hoàn tiền do sự cố sân.');
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="LỊCH HẸN CỦA BẠN"
        title="Lịch đặt của tôi"
        description="Theo dõi đặt sân, dời lịch và chia sẻ trải nghiệm sau mỗi trận đấu."
      >
        <Link className="button button--primary" to="/venues">
          Đặt thêm sân
        </Link>
      </PageHeader>
      <Notice type="success">{message}</Notice>
      <Notice>{error || actionError}</Notice>
      <div className="tabs">
        {[
          ['ALL', 'Tất cả'],
          ['PENDING', 'Chờ thanh toán'],
          ['CONFIRMED', 'Sắp diễn ra'],
          ['COMPLETED', 'Hoàn thành'],
        ].map(([value, label]) => (
          <button
            className={tab === value ? 'active' : ''}
            key={value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : bookings.length ? (
        <div className="booking-list">
          {bookings.map((b) => (
            <article className="booking-card" key={b.id}>
              <div className="booking-card__header">
                <span className="booking-code">#{b.id.slice(0, 8).toUpperCase()}</span>
                <StatusBadge status={b.status} />
              </div>
              <div className="booking-card__details">
                <div className="sport-icon">
                  <CalendarDays size={25} />
                </div>
                <div>
                  <h3>{b.court_name}</h3>
                  <p>
                    <MapPin size={14} />
                    {b.venue_name}
                  </p>
                  <p>
                    <CalendarDays size={14} />
                    {dateVN(b.start_at)} <Clock3 size={14} />
                    {timeVN(b.start_at)} – {timeVN(b.end_at)}
                  </p>
                </div>
                <strong className="booking-card__amount">{money(b.total_amount)}</strong>
              </div>
              {b.issue_reported_at && (
                <Notice type="info">
                  Sân đã báo sự cố: {b.issue_reason}.{' '}
                  {b.refund_status
                    ? 'Yêu cầu hoàn tiền đang được xử lý.'
                    : 'Bạn có thể chọn dời lịch hoặc yêu cầu hoàn tiền.'}
                </Notice>
              )}
              {b.refund_status && (
                <div className="refund-progress">
                  <span>Hoàn tiền:</span>
                  <StatusBadge status={b.refund_status} refund />
                  <small>Chờ duyệt → Đã duyệt → Đang hoàn → Đã hoàn</small>
                </div>
              )}
              <div className="booking-card__actions">
                {b.status === 'PENDING' && (
                  <Link className="button button--primary button--small" to={`/checkout/${b.id}`}>
                    Tiếp tục thanh toán
                  </Link>
                )}
                {b.status === 'CONFIRMED' && !b.refund_status && (
                  <button
                    className="button button--secondary button--small"
                    onClick={() => setModal({ type: 'reschedule', booking: b })}
                  >
                    Dời lịch
                  </button>
                )}
                {b.status === 'CONFIRMED' && b.issue_reported_at && !b.refund_status && (
                  <button
                    className="button button--danger button--small"
                    disabled={busy === b.id}
                    onClick={() => requestRefund(b)}
                  >
                    Yêu cầu hoàn tiền
                  </button>
                )}
                {b.status === 'COMPLETED' && !b.review_id && (
                  <button
                    className="button button--primary button--small"
                    onClick={() => setModal({ type: 'review', booking: b })}
                  >
                    Viết đánh giá
                  </button>
                )}
                {b.review_id && <span className="muted">Đã đánh giá · Cảm ơn bạn!</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <Empty
            action={
              <Link to="/venues" className="button button--primary">
                Tìm sân ngay
              </Link>
            }
          >
            Chưa có lượt đặt sân trong mục này.
          </Empty>
        )
      )}
      {modal?.type === 'reschedule' && (
        <RescheduleModal booking={modal.booking} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal?.type === 'review' && (
        <ReviewModal booking={modal.booking} onClose={() => setModal(null)} onDone={done} />
      )}
    </>
  );
}
