import { useEffect, useState } from 'react';
import { Banknote, CalendarDays } from 'lucide-react';
import { post } from '../../api/client';
import {
  useResource,
  PageHeader,
  Field,
  Notice,
  Loading,
  Empty,
  SlotGrid,
  SlotLegend,
  Modal,
  StatusBadge,
  money,
  dateVN,
  timeVN,
  todayVN,
} from '../../components/shared';
export default function CounterPage() {
  const venues = useResource('/venues?mine=true');
  const [venueId, setVenueId] = useState('');
  const [courtId, setCourtId] = useState('');
  const [date, setDate] = useState(todayVN());
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState('CASH');
  useEffect(() => {
    if (!venueId && venues.data?.length) setVenueId(venues.data[0].id);
  }, [venues.data, venueId]);
  const venue = useResource(venueId ? `/venues/${venueId}` : null);
  useEffect(() => {
    if (venue.data?.courts?.length && !venue.data.courts.some((c) => c.id === courtId))
      setCourtId(venue.data.courts[0].id);
    else if (venue.data && !venue.data.courts?.length) setCourtId('');
  }, [venue.data, courtId]);
  const slots = useResource(courtId ? `/courts/${courtId}/slots?date=${date}` : null);
  const bookings = useResource('/bookings');
  const active = (bookings.data || []).filter(
    (b) => b.venue_id === venueId && b.status === 'CONFIRMED',
  );
  async function action(booking, type) {
    setBusy(true);
    setError('');
    try {
      await post(`/bookings/${booking.id}/${type}`, type === 'extend' ? { method } : {});
      setMessage(
        type === 'extend'
          ? 'Đã gia hạn ca kế tiếp và ghi nhận thanh toán.'
          : 'Đã xác nhận hoàn thành đơn.',
      );
      bookings.reload();
      slots.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function walkIn(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      await post('/bookings/walk-in', { ...values, time_slot_id: modal.id });
      setModal(null);
      setMessage('Đã tạo đơn tại quầy và ghi nhận thanh toán.');
      slots.reload();
      bookings.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="BÁN SÂN & THANH TOÁN TẠI CHỖ"
        title="Quầy thu ngân"
        description="Bán ca còn trống, gia hạn ca liền kề và xác nhận hoàn thành đơn."
      />
      <Notice type="success">{message}</Notice>
      <Notice>{error || venues.error || venue.error || slots.error || bookings.error}</Notice>
      <div className="panel">
        <div className="panel__header">
          <h2>
            <CalendarDays size={20} />
            Lịch bán sân
          </h2>
          <div className="action-row">
            <Field label="Cơ sở">
              <select
                className="input"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
              >
                {venues.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sân">
              <select
                className="input"
                value={courtId}
                onChange={(e) => setCourtId(e.target.value)}
              >
                {venue.data?.courts?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ngày">
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="panel__body">
          <SlotLegend />
          {slots.loading ? (
            <Loading />
          ) : slots.data?.length ? (
            <SlotGrid
              slots={slots.data}
              disabled={
                busy ||
                venue.data?.status !== 'ACTIVE' ||
                venue.data?.courts?.find((c) => c.id === courtId)?.status !== 'ACTIVE'
              }
              onSelect={(s) => {
                setError('');
                setModal(s);
              }}
            />
          ) : (
            <Empty>Chưa có lịch sân cho lựa chọn này.</Empty>
          )}
        </div>
      </div>
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>Đơn đã xác nhận tại cơ sở</h2>
            <p className="muted">
              Chỉ hoàn thành sau giờ kết thúc. Gia hạn thanh toán ngay tại quầy.
            </p>
          </div>
          <Field label="Thanh toán khi gia hạn">
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Tiền mặt</option>
              <option value="BANK_TRANSFER">Chuyển khoản</option>
            </select>
          </Field>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Sân & giờ</th>
                <th>Tiền sân</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {active.map((b) => (
                <tr key={b.id}>
                  <td>
                    {b.customer_name || 'Khách hàng'}
                    <small>#{b.id.slice(0, 8)}</small>
                  </td>
                  <td>
                    {b.court_name}
                    <small>
                      {dateVN(b.start_at)} · {timeVN(b.start_at)} – {timeVN(b.end_at)}
                    </small>
                  </td>
                  <td>{money(b.total_amount)}</td>
                  <td>
                    <StatusBadge status={b.status} />
                    {b.issue_reported_at && <small className="danger-text">Có sự cố sân</small>}
                  </td>
                  <td>
                    <div className="action-row">
                      <button
                        className="button button--secondary button--small"
                        disabled={busy || !!b.issue_reported_at}
                        onClick={() => action(b, 'extend')}
                      >
                        Gia hạn
                      </button>
                      <button
                        className="button button--primary button--small"
                        disabled={busy || new Date(b.end_at) > new Date() || !!b.issue_reported_at}
                        onClick={() => action(b, 'complete')}
                      >
                        Hoàn thành
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!active.length && <Empty>Không có đơn chờ xử lý tại cơ sở này.</Empty>}
        </div>
      </div>
      {modal && (
        <Modal title="Tạo đơn tại quầy" onClose={() => setModal(null)}>
          <Notice>{error}</Notice>
          <p className="muted">
            {date.split('-').reverse().join('/')} · {modal.start_time.slice(0, 5)} –{' '}
            {modal.end_time.slice(0, 5)}
          </p>
          <p className="walkin-total">{money(modal.price)}</p>
          <form className="form-stack" onSubmit={walkIn}>
            <Field label="Tên khách">
              <input
                name="customer_name"
                className="input"
                minLength={2}
                maxLength={120}
                required
                autoFocus
              />
            </Field>
            <Field label="Số điện thoại (tùy chọn)">
              <input name="customer_phone" className="input" type="tel" maxLength={20} />
            </Field>
            <Field label="Phương thức thanh toán">
              <select name="method" className="input">
                <option value="CASH">Tiền mặt</option>
                <option value="BANK_TRANSFER">Chuyển khoản</option>
              </select>
            </Field>
            <Notice type="info">
              Đơn được xác nhận ngay và ghi nhận đã thu đủ tiền tại quầy. Có thể bán ca đang diễn ra
              nếu chưa kết thúc.
            </Notice>
            <button className="button button--primary button--wide" disabled={busy}>
              <Banknote size={18} />
              {busy ? 'Đang tạo đơn…' : 'Đã thu tiền · Xác nhận bán sân'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
