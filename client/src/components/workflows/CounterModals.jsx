import { Field, Notice, BookingSummary, money, timeVN, dateVN, todayVN } from '../shared';
import ActionModal from './ActionModal';
import { WorkflowResource } from './ResourceState';
import { useWorkflowResource, useServerNow } from '../../hooks/useWorkflowResource.js';
import { operations } from '../../services/operations.js';
import { walkInErrors, walkInReason, nextSlot, canComplete } from '../../utils/operations.js';
export function CounterPayment() {
  return <><Field label="Phương thức thu tại quầy">
    <select className="input" name="method">
      <option value="CASH">Tiền mặt</option>
      <option value="BANK_TRANSFER">Chuyển khoản</option>
    </select>
  </Field><label>
    <input type="checkbox" name="collected" required />
     Tôi xác nhận đã thu đủ tiền tại quầy
  </label></>;
}
export function WalkInModal({
  slot,
  court,
  venue,
  now,
  ...props
}) {
  return <ActionModal title="Bán sân tại quầy" {...props} disabled={!!walkInReason(slot, court, venue, now)} validate={v => Object.values(walkInErrors(v))[0]} action={v => operations.walkIn({
    time_slot_id: slot.id,
    customer_name: v.customer_name.trim(),
    customer_phone: v.customer_phone.trim(),
    method: v.method
  })} submitLabel="Xác nhận bán sân">
    <p>{venue.name} · {court.name}</p>
    <p>
      {dateVN(slot.start_at)}
       ·
      {timeVN(slot.start_at)}
       –
      {timeVN(slot.end_at)}
       ·
      <strong>{money(slot.price)}</strong>
    </p>
    <Notice>{walkInReason(slot, court, venue, now)}</Notice>
    <Field label="Tên khách">
      <input className="input" name="customer_name" minLength={2} maxLength={120} required />
    </Field>
    <Field label="Điện thoại (tùy chọn)">
      <input className="input" name="customer_phone" maxLength={30} />
    </Field>
    <CounterPayment />
  </ActionModal>;
}
export function ExtendModal({
  booking,
  ...props
}) {
  const detail = useWorkflowResource(`/bookings/${booking.id}`),
    current = detail.data || booking;
  const court = useWorkflowResource(`/courts/${current.court_id}`),
    venue = useWorkflowResource(`/venues/${current.venue_id}`);
  const slots = useWorkflowResource(`/courts/${current.court_id}/slots?date=${todayVN(Date.parse(current.start_at))}`);
  const now = useServerNow(slots.offset),
    next = nextSlot(current, slots.data);
  const reason = !next ? 'Không có ca liền kề trong cùng ngày.' : walkInReason(next, court.data, venue.data, now);
  return <ActionModal title="Xác nhận gia hạn ca liền kề" {...props} disabled={detail.loading || !!detail.error || current.status !== 'CONFIRMED' || !!current.issue_reported_at || !!reason} action={v => operations.extend(current.id, v.method)}>
    <WorkflowResource resource={detail}><WorkflowResource resource={court}><WorkflowResource resource={venue}>
    <BookingSummary booking={current} />
    <WorkflowResource resource={slots}>
      <p>Ca gia hạn: {next ? `${timeVN(next.start_at)} – ${timeVN(next.end_at)} · ${money(next.price)}` : 'Không có'}</p>
    </WorkflowResource>
    </WorkflowResource></WorkflowResource></WorkflowResource>
    <Notice>{reason || detail.error?.message || court.error?.message || venue.error?.message}</Notice>
    <Notice type="info">Tạo booking EXTENSION độc lập, liên kết đơn cha và ghi nhận đúng giá ca kế tiếp.</Notice>
    <CounterPayment />
  </ActionModal>;
}
export function CompleteModal({
  booking,
  now,
  ...props
}) {
  return <ActionModal title="Xác nhận hoàn thành đơn" {...props} disabled={!canComplete(booking, now)} action={() => operations.complete(booking.id)}>
    <BookingSummary booking={booking} />
    <Notice type="info">Xác nhận khách đã kết thúc sử dụng sân. Booking chuyển Hoàn thành; ca giữ trạng thái Đã đặt để bảo toàn lịch sử.</Notice>
  </ActionModal>;
}
