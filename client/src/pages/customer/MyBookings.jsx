import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Clock3, MapPin } from 'lucide-react';
import { PageHeader, Notice, StatusBadge, money, dateVN, timeVN, labels } from '../../components/shared';
import { useCustomerResource, useServerNow } from '../../hooks/useCustomerResource.js';
import { pagePath } from '../../services/customer.js';
import { BOOKING_STATES, PAGE_SIZE, canReschedule, canRequestRefund, canReview } from '../../utils/customer.js';
import { CustomerResource, Pagination } from '../../components/customer/ResourceState';
import BookingDetail from '../../components/customer/BookingDetail';
import { CustomerReschedule, CustomerRefund, CustomerReview } from '../../components/customer/BookingActions';
import '../../styles/customer.css';

export default function MyBookingsPage() {
  const [params, setParams] = useSearchParams(), [modal, setModal] = useState(null), [message, setMessage] = useState('');
  const status = BOOKING_STATES.includes(params.get('status')) ? params.get('status') : 'ALL';
  const offset = /^\d+$/.test(params.get('offset') || '') ? Math.min(1000000, Number(params.get('offset'))) : 0;
  const resource = useCustomerResource(pagePath('/bookings', { status: status === 'ALL' ? '' : status }, offset));
  const now = useServerNow(resource.offset);
  function done(text) { setModal(null); setMessage(text); resource.reload(); }
  function changeStatus(value) { setParams(value === 'ALL' ? {} : { status: value }); }
  return <>
    <PageHeader eyebrow="LỊCH HẸN CỦA BẠN" title="Lịch đặt của tôi" description="Theo dõi giữ chỗ, lịch sử và các yêu cầu sau đặt sân."><div className="action-row"><button className="button button--secondary" onClick={resource.reload}>Làm mới lịch sử</button><Link className="button button--primary" to="/venues">Đặt thêm sân</Link></div></PageHeader>
    <Notice type="success">{message}</Notice>
    <div className="tabs" aria-label="Lọc trạng thái booking">{['ALL', ...BOOKING_STATES].map((value) => <button className={status === value ? 'active' : ''} key={value} aria-pressed={status === value} onClick={() => changeStatus(value)}>{value === 'ALL' ? 'Tất cả' : labels[value]}</button>)}</div>
    <CustomerResource resource={resource} empty="Chưa có booking trong mục này."><div className="booking-list">{resource.data?.map((b) => <article className="booking-card" key={b.id} data-booking-id={b.id}>
      <div className="booking-card__header"><span className="booking-code">#{b.id?.slice(0, 8).toUpperCase()} · {labels[b.source] || b.source || '—'}</span><StatusBadge status={b.status} /></div>
      <div className="booking-card__details"><div className="sport-icon"><CalendarDays size={25} /></div><div><h3>{b.court_name || 'Sân thể thao'}</h3><p><MapPin size={14} />{b.venue_name || '—'}</p><p><CalendarDays size={14} />{dateVN(b.start_at)} <Clock3 size={14} />{timeVN(b.start_at)} – {timeVN(b.end_at)}</p></div><strong className="booking-card__amount">{money(b.total_amount)}</strong></div>
      {b.issue_reported_at && <Notice type="info">Sự cố đã được cơ sở ghi nhận: {b.issue_reason || 'Có sự cố sân'}</Notice>}
      {b.refund_status && <div className="refund-progress"><span>Hoàn tiền:</span><StatusBadge status={b.refund_status} refund /><small>Chờ duyệt → Đã duyệt → Đang hoàn tiền → Đã hoàn tiền</small></div>}
      <div className="booking-card__actions"><button className="button button--secondary button--small" onClick={() => setModal({ type: 'detail', booking: b })}>Chi tiết & lịch sử</button>
        {b.status === 'PENDING' && <Link className="button button--primary button--small" to={`/checkout/${b.id}`}>Xem giữ chỗ</Link>}
        {canReschedule(b, now) && <button className="button button--secondary button--small" onClick={() => setModal({ type: 'reschedule', booking: b })}>Dời lịch</button>}
        {canRequestRefund(b) && <button className="button button--secondary button--small" onClick={() => setModal({ type: 'refund', booking: b })}>Yêu cầu hoàn tiền</button>}
        {canReview(b) && <button className="button button--primary button--small" onClick={() => setModal({ type: 'review', booking: b })}>Viết đánh giá</button>}
        {b.review_id && <span className="muted">Đã đánh giá · Xem nội dung trong chi tiết.</span>}
      </div>
    </article>)}</div></CustomerResource>
    <Pagination offset={offset} count={resource.data?.length || 0} limit={PAGE_SIZE} loading={resource.loading} onChange={(value) => setParams({ ...(status !== 'ALL' ? { status } : {}), offset: String(value) })} />
    {modal?.type === 'detail' && <BookingDetail id={modal.booking.id} onClose={() => setModal(null)} />}
    {modal?.type === 'reschedule' && <CustomerReschedule booking={modal.booking} onClose={() => setModal(null)} onDone={done} />}
    {modal?.type === 'refund' && <CustomerRefund booking={modal.booking} onClose={() => setModal(null)} onDone={done} />}
    {modal?.type === 'review' && <CustomerReview booking={modal.booking} onClose={() => setModal(null)} onDone={done} />}
  </>;
}
