import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CreditCard, Landmark, Wallet, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { get, post } from '../../api/client';
import { BookingSummary, PageHeader, Loading, Notice, StatusBadge } from '../../components/shared';
export default function CheckoutPage() {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [offset, setOffset] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let mounted = true;
    get(`/bookings/${bookingId}`)
      .then(({ data, server_time }) => {
        if (mounted) {
          setBooking(data);
          setOffset(new Date(server_time).getTime() - Date.now());
        }
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      });
    return () => {
      mounted = false;
    };
  }, [bookingId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const remaining =
    booking?.held_until && offset !== null
      ? Math.max(0, Math.ceil((new Date(booking.held_until).getTime() - now - offset) / 1000))
      : 0;
  const paid = booking && ['CONFIRMED', 'COMPLETED'].includes(booking.status);
  const expired =
    booking && (booking.status === 'EXPIRED' || (booking.status === 'PENDING' && remaining === 0));
  async function pay() {
    setBusy(true);
    setError('');
    try {
      const attempt = await post('/payments/create', { booking_id: bookingId, method });
      await post('/payments/confirm', { transaction_code: attempt.data.transaction_code });
      const result = await get(`/bookings/${bookingId}`);
      setBooking(result.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!booking) return error ? <Notice>{error}</Notice> : <Loading />;
  return (
    <>
      <PageHeader
        eyebrow="HOÀN TẤT LỊCH HẸN"
        title={paid ? 'Đặt sân thành công' : 'Xác nhận & thanh toán'}
        description={
          paid
            ? 'Sân của bạn đã được xác nhận. Hẹn gặp bạn trên sân!'
            : 'Hoàn tất thanh toán trước khi hết thời hạn giữ chỗ.'
        }
      />
      <div className="checkout-grid">
        <div>
          <Notice>{error}</Notice>
          {paid ? (
            <div className="panel success-panel">
              <CheckCircle2 size={52} />
              <h2>Mọi thứ đã sẵn sàng!</h2>
              <p>Bạn có thể xem lại lịch đặt và thông tin sân trong lịch sử cá nhân.</p>
              <Link to="/my-bookings" className="button button--primary">
                Xem lịch đặt của tôi
              </Link>
            </div>
          ) : (
            <div className="panel">
              <div className="panel__header">
                <h2>Phương thức thanh toán</h2>
                <span className="chip">SANDBOX</span>
              </div>
              <div className="panel__body">
                <div
                  className={`countdown ${expired ? 'countdown--expired' : ''}`}
                  aria-live="polite"
                >
                  <span>
                    {expired ? 'Thời hạn giữ chỗ đã kết thúc' : 'Thời gian giữ chỗ còn lại'}
                  </span>
                  <strong>
                    {String(Math.floor(remaining / 60)).padStart(2, '0')}:
                    {String(remaining % 60).padStart(2, '0')}
                  </strong>
                </div>
                {expired && <Notice>Đơn giữ chỗ đã hết hạn. Vui lòng chọn lại khung giờ.</Notice>}
                <div className="payment-methods">
                  {[
                    ['BANK_TRANSFER', 'Chuyển khoản', Landmark],
                    ['CREDIT_CARD', 'Thẻ tín dụng', CreditCard],
                    ['E_WALLET', 'Ví điện tử', Wallet],
                  ].map(([value, label, Icon]) => (
                    <label
                      key={value}
                      className={`payment-option ${method === value ? 'active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="method"
                        value={value}
                        checked={method === value}
                        onChange={() => setMethod(value)}
                        disabled={expired || busy}
                      />
                      <Icon size={22} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <Notice type="info">
                  Môi trường demo: nút bên dưới xác nhận thanh toán giả lập, không thu tiền thực.
                </Notice>
                <button
                  className="button button--primary button--wide"
                  disabled={busy || expired || booking.status !== 'PENDING' || offset === null}
                  onClick={pay}
                >
                  {busy ? 'Đang xác nhận…' : 'Xác nhận thanh toán Sandbox'}
                </button>
                {expired && (
                  <Link
                    className="button button--secondary button--wide"
                    to={`/courts/${booking.court_id}/schedule`}
                  >
                    Chọn lại lịch sân
                  </Link>
                )}
                <p className="secure-note">
                  <ShieldCheck size={15} />
                  Thời hạn được tính theo thời gian máy chủ.
                </p>
              </div>
            </div>
          )}
        </div>
        <aside className="panel">
          <div className="panel__header">
            <h2>Chi tiết đặt sân</h2>
            <StatusBadge status={booking.status} />
          </div>
          <div className="panel__body">
            <BookingSummary booking={booking} />
            <small className="muted">Mã đơn: {booking.id}</small>
          </div>
        </aside>
      </div>
    </>
  );
}
