import { useState } from 'react';
import { post, patch } from '../../api/client';
import {
  useResource,
  PageHeader,
  Notice,
  Loading,
  Empty,
  StatusBadge,
  dateVN,
  timeVN,
  money,
  Modal,
  Field,
} from '../../components/shared';
import { RescheduleModal } from '../../components/BookingActions';
export default function RequestsPage() {
  const { data, loading, error, reload } = useResource('/bookings');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const bookings = (data || []).filter((b) => b.status === 'CONFIRMED' || b.refund_status);
  function done(msg) {
    setMessage(msg);
    setModal(null);
    reload();
  }
  async function report(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setActionError('');
    try {
      await post(`/bookings/${modal.booking.id}/venue-issue`, body);
      done(
        body.action === 'REFUND'
          ? 'Đã ghi nhận sự cố và tạo yêu cầu hoàn tiền.'
          : 'Đã báo sự cố. Khách có thể lựa chọn dời sân hoặc hoàn tiền.',
      );
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function refund(b, status) {
    setBusy(true);
    setActionError('');
    try {
      await patch(`/refunds/${b.refund_id}/status`, { status });
      done(
        status === 'APPROVED'
          ? 'Đã duyệt; hệ thống chuyển sang đang hoàn tiền.'
          : 'Đã xác nhận hoàn tiền toàn phần.',
      );
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="HẬU MÃI & VẬN HÀNH"
        title="Sự cố & hoàn tiền"
        description="Xử lý đơn khi sân gặp sự cố, giữ đầy đủ dấu vết dời sân và hoàn tiền."
      />
      <Notice type="success">{message}</Notice>
      <Notice>{error || actionError}</Notice>
      <div className="refund-flow">
        <span>Quy trình hoàn tiền</span>
        {['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'].map((s, i) => (
          <span key={s}>
            {i > 0 && <b>→</b>}
            <StatusBadge status={s} refund />
          </span>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : bookings.length ? (
        <div className="booking-list">
          {bookings.map((b) => (
            <article className="booking-card" key={b.id}>
              <div className="booking-card__header">
                <div>
                  <span className="booking-code">#{b.id.slice(0, 8).toUpperCase()}</span>
                  <h3>
                    {b.court_name} · {b.venue_name}
                  </h3>
                </div>
                <StatusBadge status={b.status} />
              </div>
              <div className="booking-card__details">
                <div>
                  <p>
                    {dateVN(b.start_at)} · {timeVN(b.start_at)} – {timeVN(b.end_at)}
                  </p>
                  <p className="muted">Khách: {b.customer_name || 'Khách hàng'}</p>
                </div>
                <strong className="booking-card__amount">{money(b.total_amount)}</strong>
              </div>
              {b.issue_reported_at && <Notice type="info">Sự cố đã báo: {b.issue_reason}</Notice>}
              {b.refund_status && (
                <div className="action-row">
                  <span>Hoàn toàn phần:</span>
                  <StatusBadge status={b.refund_status} refund />
                </div>
              )}
              <div className="booking-card__actions">
                {b.status === 'CONFIRMED' && !b.issue_reported_at && !b.refund_status && (
                  <button
                    className="button button--danger button--small"
                    disabled={busy}
                    onClick={() => {
                      setActionError('');
                      setModal({ type: 'issue', booking: b });
                    }}
                  >
                    Báo sự cố sân
                  </button>
                )}
                {b.status === 'CONFIRMED' && b.issue_reported_at && !b.refund_status && (
                  <>
                    <button
                      className="button button--secondary button--small"
                      onClick={() => setModal({ type: 'reschedule', booking: b })}
                    >
                      Dời sang sân / ca khác
                    </button>
                    <button
                      className="button button--danger button--small"
                      disabled={busy}
                      onClick={() => setModal({ type: 'issue', booking: b, refund: true })}
                    >
                      Lập yêu cầu hoàn tiền
                    </button>
                  </>
                )}
                {b.refund_status === 'REQUESTED' && (
                  <button
                    className="button button--primary button--small"
                    disabled={busy}
                    onClick={() => refund(b, 'APPROVED')}
                  >
                    Duyệt hoàn tiền
                  </button>
                )}
                {b.refund_status === 'PROCESSING' && (
                  <button
                    className="button button--primary button--small"
                    disabled={busy}
                    onClick={() => refund(b, 'COMPLETED')}
                  >
                    Xác nhận đã hoàn
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        !error && <Empty>Chưa có đơn cần xử lý.</Empty>
      )}
      {modal?.type === 'reschedule' && (
        <RescheduleModal booking={modal.booking} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal?.type === 'issue' && (
        <Modal
          title={modal.refund ? 'Lập yêu cầu hoàn tiền' : 'Báo sự cố sân'}
          onClose={() => setModal(null)}
        >
          <Notice>{actionError}</Notice>
          <form className="form-stack" onSubmit={report}>
            <input type="hidden" name="action" value={modal.refund ? 'REFUND' : 'REPORT'} />
            <Field label="Mô tả sự cố">
              <textarea
                className="input"
                name="reason"
                minLength={5}
                maxLength={1000}
                required
                defaultValue={modal.booking.issue_reason || ''}
                placeholder="Nêu rõ sự cố ảnh hưởng đến lịch đặt"
              />
            </Field>
            <Notice type="info">
              Khung giờ gặp sự cố sẽ bị khóa. Thao tác có ghi nhật ký và chỉ áp dụng cho đơn của cơ
              sở bạn quản lý.
            </Notice>
            <button className="button button--danger" disabled={busy}>
              {busy ? 'Đang xử lý…' : modal.refund ? 'Tạo yêu cầu hoàn tiền' : 'Xác nhận báo sự cố'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
