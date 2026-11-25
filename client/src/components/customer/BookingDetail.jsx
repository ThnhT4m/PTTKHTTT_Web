import { Modal, BookingSummary, StatusBadge, money, dateVN, timeVN, labels, Notice } from '../shared';
import { useCustomerResource } from '../../hooks/useCustomerResource.js';
import { operations } from '../../services/operations.js';
import { pagePath } from '../../services/customer.js';
import { CustomerResource } from './ResourceState';

export default function BookingDetail({ id, onClose, onRelated }) {
  const detail = useCustomerResource(`/bookings/${id}`);
  const history = useCustomerResource(`/bookings/${id}/history`);
  const refunds = useCustomerResource(pagePath('/refunds', { booking_id: id }));
  const refundId = refunds.data?.[0]?.id || history.data?.refund?.id;
  const refund = useCustomerResource(refundId ? `/refunds/${refundId}` : null);
  const related = useCustomerResource(onRelated && detail.data?.venue_id ? `/bookings#related-${id}` : null, { load: (options) => operations.related(detail.data.venue_id, options) });
  const data = history.data;
  return <Modal title="Chi tiết và lịch sử booking" onClose={onClose}><div className="customer-booking-modal">
    <CustomerResource resource={detail}>{detail.data && <><p>Mã đơn: {detail.data.id}</p><StatusBadge status={detail.data.status} /><p>Nguồn: {labels[detail.data.source] || detail.data.source || '—'}</p><BookingSummary booking={detail.data} /></>}</CustomerResource>
    {detail.data?.parent_booking_id && <p>Booking cha: {onRelated ? <button className="button button--secondary" onClick={() => onRelated(detail.data.parent_booking_id)}>{detail.data.parent_booking_id}</button> : detail.data.parent_booking_id}</p>}
    {onRelated && <CustomerResource resource={related} empty="Chưa có booking gia hạn.">{related.data?.filter((b) => b.parent_booking_id === id).map((b) => <p key={b.id}>Booking gia hạn: <button className="button button--secondary" onClick={() => onRelated(b.id)}>{b.id}</button></p>)}</CustomerResource>}
    <h3>Giao dịch đã tồn tại</h3><CustomerResource resource={history}>{data && <>
      {data.payments?.length ? <ul className="customer-history">{data.payments.map((payment) => <li key={payment.id}><strong>{payment.transaction_code || payment.id}</strong><p>{money(payment.amount)} · {payment.method}</p><StatusBadge status={payment.status} /><p>{dateVN(payment.created_at)} · {timeVN(payment.created_at)}</p></li>)}</ul> : <p className="muted">Chưa có giao dịch. Giữ chỗ không đồng nghĩa đã thanh toán.</p>}
      <h3>Lịch sử dời sân</h3>{data.reschedules?.length ? <ul className="customer-history">{data.reschedules.map((item) => <li key={item.id}><p>{item.reason}</p><p>{item.is_venue_issue ? 'Dời do sự cố cơ sở' : 'Dời tự nguyện'}</p><p>Ca cũ: {item.old_time_slot_id}<br />Ca mới: {item.new_time_slot_id}</p><p>{dateVN(item.created_at)} · {timeVN(item.created_at)}</p></li>)}</ul> : <p className="muted">Chưa có lần dời lịch.</p>}
      <h3>Đánh giá đã gửi</h3>{data.review ? <><p>{'★'.repeat(data.review.rating)} · {data.review.rating}/5</p>{data.review.comment && <p>{data.review.comment}</p>}</> : <p className="muted">Chưa có đánh giá.</p>}
    </>}</CustomerResource>
    <h3>Hoàn tiền do sự cố</h3>
    <Notice type="info">Chờ duyệt → Đã duyệt → Đang hoàn tiền → Đã hoàn tiền. Hệ thống có thể chuyển Đã duyệt và Đang hoàn tiền trong cùng giao dịch.</Notice>
    <CustomerResource resource={refunds} empty="Chưa có yêu cầu hoàn tiền.">{refundId && <CustomerResource resource={refund}>{refund.data && <><StatusBadge status={refund.data.status} refund /><p>{money(refund.data.amount)} · {refund.data.reason}</p></>}</CustomerResource>}</CustomerResource>
    <button className="button button--secondary" onClick={() => { detail.reload(); history.reload(); refunds.reload(); refund.reload(); }}>Làm mới chi tiết</button>
  </div></Modal>;
}
