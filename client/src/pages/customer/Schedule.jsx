import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, ArrowRight } from 'lucide-react';
import { post } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import {
  useResource,
  PageHeader,
  Field,
  Loading,
  Notice,
  Empty,
  SlotGrid,
  SlotLegend,
  SPORTS,
  todayVN,
  money,
} from '../../components/shared';
export default function SchedulePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [date, setDate] = useState(todayVN());
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const court = useResource(`/courts/${id}`);
  const slots = useResource(`/courts/${id}/slots?date=${date}`);
  async function book() {
    if (!user) return navigate('/login', { state: { from: `/courts/${id}/schedule` } });
    setBusy(true);
    setError('');
    try {
      const { data } = await post('/bookings/online', { time_slot_id: selected.id });
      navigate(`/checkout/${data.id || data.booking?.id}`);
    } catch (err) {
      setError(err.message);
      slots.reload();
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        className="text-link"
        to={court.data?.venue_id ? `/venues/${court.data.venue_id}` : '/venues'}
      >
        ← Quay lại cơ sở
      </Link>
      <PageHeader
        eyebrow={SPORTS[court.data?.sport_type] || 'LỊCH SÂN THEO NGÀY'}
        title={court.data?.name || 'Lịch khung giờ'}
        description={`${court.data?.venue_name || ''} · Các ca cố định 60 phút, 06:00 – 22:00`}
      />
      <div className="schedule-grid">
        <div className="panel">
          <div className="panel__header">
            <div>
              <h2>Chọn giờ ra sân</h2>
              <p className="muted">Chỉ những ca còn trống mới có thể được giữ chỗ.</p>
            </div>
            <Field label="Ngày chơi">
              <input
                type="date"
                className="input"
                value={date}
                min={todayVN()}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSelected(null);
                }}
              />
            </Field>
          </div>
          <div className="panel__body">
            <SlotLegend />
            <Notice>{slots.error || court.error || error}</Notice>
            {slots.loading ? (
              <Loading />
            ) : slots.data?.length ? (
              <SlotGrid
                slots={slots.data}
                disabled={busy || (!!user && user.role !== 'CUSTOMER')}
                onSelect={setSelected}
              />
            ) : (
              <Empty>Chưa có lịch được nạp cho ngày này. Hãy chọn ngày khác.</Empty>
            )}
          </div>
        </div>
        <aside className="panel booking-selection">
          <div className="panel__body">
            <div className="sport-icon">
              <CalendarDays size={27} />
            </div>
            <h2>Lịch hẹn của bạn</h2>
            {selected ? (
              <>
                <p className="muted">{court.data?.name}</p>
                <dl className="summary-list">
                  <div className="summary-list__row">
                    <dt>Ngày</dt>
                    <dd>{date.split('-').reverse().join('/')}</dd>
                  </div>
                  <div className="summary-list__row">
                    <dt>Giờ chơi</dt>
                    <dd>
                      {selected.start_time.slice(0, 5)} – {selected.end_time.slice(0, 5)}
                    </dd>
                  </div>
                  <div className="summary-list__row summary-list__row--total">
                    <dt>Thành tiền</dt>
                    <dd>{money(selected.price)}</dd>
                  </div>
                </dl>
                <button
                  className="button button--primary button--wide"
                  disabled={busy}
                  onClick={book}
                >
                  {busy ? 'Đang giữ chỗ…' : 'Tiếp tục đặt sân'}
                  <ArrowRight size={17} />
                </button>
                <p className="field__hint">
                  Thời hạn giữ chỗ sẽ do máy chủ xác định khi đặt thành công.
                </p>
              </>
            ) : (
              <p className="muted">Chọn một khung giờ còn trống để xem chi tiết đặt sân.</p>
            )}
            {user && user.role !== 'CUSTOMER' && (
              <Notice type="info">
                Tài khoản quản lý sử dụng quầy thu ngân để tạo đơn tại quầy.
              </Notice>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
