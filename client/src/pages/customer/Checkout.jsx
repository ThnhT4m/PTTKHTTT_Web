import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CreditCard, Landmark, Wallet, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { get, post } from '../../api/client';
import { BookingSummary, PageHeader, Loading, Notice, StatusBadge } from '../../components/shared';
export default function CheckoutPage() {
  // Online payment is outside the frontend QA acceptance scope.
  const paymentEnabled = false;
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [offset, setOffset] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let mounted = true;
    let inFlight = false;
    const controller = new AbortController();
    setBooking(null); setError(''); setOffset(null);
    function load() {
      if (inFlight) return;
      inFlight = true;
      get(`/bookings/${bookingId}`, { signal: controller.signal })
      .then(({ data, server_time }) => {
        if (mounted) {
          setBooking(data);
          setError('');
          setOffset(new Date(server_time).getTime() - Date.now());
        }
      })
      .catch((e) => {
        if (mounted && e.name !== 'AbortError') setError(e.message);
      }).finally(() => { inFlight = false; });
    }
    load();
    const refresh = setInterval(load, 15000);
    return () => {
      mounted = false;
      controller.abort(); clearInterval(refresh);
    };
  }, [bookingId, revision]);
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
    if (!paymentEnabled) return;
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
  if (!booking) return error ? <><Notice>{error}</Notice><button className="button button--secondary" onClick={() => setRevision((n) => n + 1)}>Thử lại</button><Link className="text-link" to="/my-bookings">Về lịch sử đặt sân</Link></> : <Loading />;
  return (
    <>
      <PageHeader
        eyebrow="HOÀN TẤT LỊCH HẸN"
        title={paid ? 'Booking đã xác nhận' : 'Thông tin giữ chỗ'}
        description={
          paid
            ? 'Sân của bạn đã được xác nhận. Hẹn gặp bạn trên sân!'
            : 'Theo dõi thời hạn giữ chỗ chính thức do máy chủ trả về.'
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
                <h2>Thông tin giữ chỗ</h2>
                <span className="chip">CHỈ XEM</span>
              </div>
              <div className="panel__body">
                <div
                  className={`countdown ${expired ? 'countdown--expired' : ''}`}
                  role="timer"
                  aria-live="off"
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
                        disabled={!paymentEnabled || expired || busy}
                      />
                      <Icon size={22} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <Notice type="info">
                  Thanh toán online chưa khả dụng và nằm ngoài phạm vi nghiệm thu Frontend này. Chưa có tiền được ghi nhận từ thao tác giữ chỗ này.
                </Notice>
                <button
                  className="button button--primary button--wide"
                  disabled={!paymentEnabled || busy || expired || booking.status !== 'PENDING' || offset === null}
                  onClick={pay}
                >
                  {paymentEnabled ? 'Xác nhận thanh toán Sandbox' : 'Thanh toán chưa khả dụng'}
                </button>
                <Link className="button button--secondary button--wide" to="/my-bookings">Xem lịch sử đặt sân</Link>
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
