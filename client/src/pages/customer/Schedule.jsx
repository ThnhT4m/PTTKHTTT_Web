import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarDays, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader, Field, Notice, SlotLegend, SPORTS, money, timeVN, todayVN, labels } from '../../components/shared';
import { useCustomerResource, useServerNow } from '../../hooks/useCustomerResource.js';
import { customer } from '../../services/customer.js';
import { onlineSlotReason, validScheduleDate } from '../../utils/customer.js';
import { CustomerResource } from '../../components/customer/ResourceState';
import '../../styles/customer.css';

export default function SchedulePage() {
  const { id } = useParams(), navigate = useNavigate(), { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || todayVN(), context = `${id}/${date}`;
  const [selection, setSelection] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [unknown, setUnknown] = useState(false);
  const locked = useRef(false), latest = useRef(context); latest.current = context;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const court = useCustomerResource(`/courts/${id}`);
  const venue = useCustomerResource(court.data?.venue_id ? `/venues/${court.data.venue_id}` : null);
  const validDate = validScheduleDate(date, todayVN());
  const slots = useCustomerResource(validDate ? `/courts/${id}/slots?date=${date}` : null, { interval: 30000 });
  const now = useServerNow(slots.offset), selected = selection?.context === context ? slots.data?.find((s) => s.id === selection.id) : null;
  const selectedReason = selected ? onlineSlotReason(selected, court.data, venue.data, now) : '';
  useEffect(() => {
    if (slots.data && selection?.context === context && (!selected || selectedReason)) {
      setSelection(null); setError('Ca đã chọn không còn đủ điều kiện. Vui lòng chọn lại lịch mới nhất.');
    }
  }, [slots.data, selectedReason, context]);
  useEffect(() => { const refresh = () => slots.reload(); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [slots.reload]);
  async function book() {
    if (locked.current || !selected || selectedReason || slots.loading || unknown) return;
    const requestContext = context;
    if (!user) return navigate('/login', { state: { from: `/courts/${id}/schedule?date=${date}` } });
    if (user.role !== 'CUSTOMER') { setError('Chỉ tài khoản CUSTOMER được giữ chỗ online.'); return; }
    locked.current = true; setBusy(true); setError('');
    try {
      if (latest.current !== requestContext) return;
      const { data } = await customer.hold(selected.id);
      if (!mounted.current || latest.current !== requestContext) return;
      const bookingId = data.id || data.booking?.id;
      if (!bookingId) throw new Error('Phản hồi giữ chỗ thiếu mã đơn. Hãy kiểm tra lịch sử đặt sân.');
      navigate(`/checkout/${bookingId}`);
    } catch (err) {
      if (!mounted.current || latest.current !== requestContext) return;
      if (err.kind === 'network' || !err.status || err.status >= 500) { setUnknown(true); setError('Chưa xác định được kết quả giữ chỗ. Hãy kiểm tra lịch sử đặt sân trước khi thử lại.'); }
      else { setError(err.message); slots.reload(); setSelection(null); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  return <>
    <Link className="text-link" to={court.data?.venue_id ? `/venues/${court.data.venue_id}` : '/venues'}>← Quay lại cơ sở</Link>
    <PageHeader eyebrow={SPORTS[court.data?.sport_type] || 'LỊCH SÂN THEO NGÀY'} title={court.data?.name || 'Lịch khung giờ'} description={`${court.data?.venue_name || ''} · Các ca 60 phút, 06:00 – 22:00`} />
    <CustomerResource resource={court}>
      <div className="schedule-grid"><section className="panel"><div className="panel__header"><div><h2>Chọn giờ ra sân</h2><p className="muted">Chọn một ca. Điều kiện giữ chỗ được máy chủ kiểm tra lại.</p></div><div className="action-row"><Field label="Ngày chơi"><input className="input" type="date" value={date} min={todayVN(now)} disabled={busy} onChange={(e) => { setSelection(null); setUnknown(false); setError(''); setParams({ date: e.target.value }); }} /></Field><button className="button button--secondary" disabled={busy || !validDate} onClick={slots.reload}>Tải lại lịch</button></div></div>
        <div className="panel__body"><SlotLegend /><Notice>{error || (!validDate ? 'Chọn ngày hợp lệ, không trước hôm nay theo giờ Việt Nam.' : '')}</Notice>
          {unknown && <Link className="button button--primary" to="/my-bookings">Kiểm tra lịch sử đặt sân</Link>}
          {venue.error && <><Notice>{venue.error.message}</Notice><button className="button button--secondary" onClick={venue.reload}>Tải lại cấu hình cơ sở</button></>}
          {court.data && venue.data && (court.data.status !== 'ACTIVE' || venue.data.status !== 'ACTIVE') && <Notice>Sân hoặc cơ sở hiện không phục vụ. Vui lòng quay lại danh sách.</Notice>}
          {validDate && <CustomerResource resource={slots} empty="Chưa có lịch được sinh trong ngày này. Hãy chọn ngày khác."><div className="slot-grid" role="group" aria-label={`Lịch sân ngày ${date}`}>{slots.data?.map((slot) => {
            const reason = onlineSlotReason(slot, court.data, venue.data, now);
            const blocked = busy || !!reason || !Number.isFinite(slots.offset) || (!!user && user.role !== 'CUSTOMER');
            return <button key={slot.id} className={`slot-card slot-card--${slot.status}${selected?.id === slot.id ? ' customer-slot--selected' : ''}`} aria-pressed={selected?.id === slot.id} disabled={blocked} title={reason || undefined} onClick={() => { setSelection({ id: slot.id, context }); setError(''); }}>
              <span className="slot-card__time">{slot.start_time?.slice(0, 5) || timeVN(slot.start_at)} – {slot.end_time?.slice(0, 5) || timeVN(slot.end_at)}</span><span className="slot-card__price">{money(slot.price)}</span><small>{labels[slot.status] || slot.status}</small>{slot.status === 'AVAILABLE' && reason && <span className="customer-slot-note">{reason}</span>}
            </button>;
          })}</div></CustomerResource>}
        </div>
      </section><aside className="panel booking-selection"><div className="panel__body"><div className="sport-icon"><CalendarDays size={27} /></div><h2>Lịch hẹn của bạn</h2>{selected ? <><p>{court.data?.name}</p><dl className="summary-list"><div className="summary-list__row"><dt>Ngày</dt><dd>{date.split('-').reverse().join('/')}</dd></div><div className="summary-list__row"><dt>Giờ chơi</dt><dd>{timeVN(selected.start_at)} – {timeVN(selected.end_at)}</dd></div><div className="summary-list__row summary-list__row--total"><dt>Giá ca</dt><dd>{money(selected.price)}</dd></div></dl><button className="button button--primary button--wide" disabled={busy || !!selectedReason || slots.loading || unknown} onClick={book}>{busy ? 'Đang giữ chỗ…' : user ? 'Xác nhận giữ chỗ' : 'Đăng nhập để giữ chỗ'}<ArrowRight size={17} /></button></> : <p className="muted">Chọn một khung giờ đủ điều kiện để xem tóm tắt và xác nhận giữ chỗ.</p>}<p className="field__hint">Giá và thời hạn chính thức được trả về khi máy chủ giữ chỗ thành công.</p>{user && user.role !== 'CUSTOMER' && <Notice type="info">Tài khoản quản lý sử dụng quầy thu ngân để tạo đơn tại quầy.</Notice>}</div></aside></div>
    </CustomerResource>
  </>;
}
