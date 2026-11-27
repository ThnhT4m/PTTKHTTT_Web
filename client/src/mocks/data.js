import { addDays, todayVN } from '../utils/format.js';

export const DEMO_PASSWORD = 'Demo@12345';
export const uuid = (group, n) => `${(group * 10000 + n).toString(16).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sports = ['FOOTBALL', 'BADMINTON', 'TENNIS', 'PICKLEBALL', 'BASKETBALL'];
const sportNames = ['Bóng đá', 'Cầu lông', 'Tennis', 'Pickleball', 'Bóng rổ'];

export function createFixtures(now = Date.now()) {
  const created_at = new Date(now).toISOString();
  const today = todayVN(now);
  const users = [
    ['customer@example.com', 'Khách hàng Minh Anh', 'CUSTOMER'],
    ['customer2@example.com', 'Khách hàng Hoàng Nam', 'CUSTOMER'],
    ['manager1@example.com', 'Quản lý Thủ Đức', 'VENUE_MANAGER'],
    ['manager2@example.com', 'Quản lý Bình Thạnh', 'VENUE_MANAGER'],
    ['admin@example.com', 'Quản trị Sân Nhà', 'ADMIN'],
  ].map(([email, full_name, role], i) => ({
    id: uuid(1, i + 1), email, full_name, role, phone: `090123456${i}`,
    is_active: true, created_at, updated_at: created_at,
  }));
  const venues = ['Thủ Đức', 'Bình Thạnh'].map((district, i) => ({
    id: uuid(2, i + 1), manager_id: users[i + 2].id,
    name: `Sân Nhà ${district}`, address: `${i ? '123 Điện Biên Phủ' : '12 Võ Văn Ngân'}, TP.HCM`,
    district, description: 'Cơ sở đa bộ môn, có phòng thay đồ và bãi xe.', status: 'ACTIVE',
    payment_hold_minutes: 5, minimum_online_booking_lead_minutes: 10,
    version: 1, created_at, updated_at: created_at,
  }));
  const courts = venues.flatMap((venue, v) => [...sports, 'BADMINTON', 'TENNIS'].map((sport_type, i) => ({
    id: uuid(3, v * 10 + i + 1), venue_id: venue.id, name: `${sportNames[sports.indexOf(sport_type)]} ${i + 1}`,
    sport_type, hourly_price: [300000, 120000, 200000, 150000, 180000, 120000, 200000][i],
    description: 'Sân tiêu chuẩn, đầy đủ ánh sáng.', status: i === 5 ? 'MAINTENANCE' : i === 6 ? 'INACTIVE' : 'ACTIVE',
    version: 1, created_at, updated_at: created_at,
  })));
  const slots = [];
  courts.forEach((court, c) => {
    for (let day = -2; day <= 30; day++) {
      const slot_date = addDays(today, day);
      for (let hour = 6; hour < 22; hour++) {
        const start_time = `${String(hour).padStart(2, '0')}:00:00`;
        const end_time = `${String(hour + 1).padStart(2, '0')}:00:00`;
        slots.push({
          id: uuid(4 + c, Number(slot_date.replaceAll('-', '')) * 100 + hour),
          court_id: court.id, slot_date, start_time, end_time,
          start_at: new Date(`${slot_date}T${start_time}+07:00`).toISOString(),
          end_at: new Date(`${slot_date}T${end_time}+07:00`).toISOString(),
          price: court.hourly_price, status: court.status !== 'ACTIVE' || hour === 8 ? 'UNAVAILABLE' : 'AVAILABLE',
          held_until: null, version: 1, created_at, updated_at: created_at,
        });
      }
    }
  });
  const bookings = [], payments = [], refunds = [], reviews = [], reschedules = [];
  function booking(court, customer, status, day, hour, refundStatus = null, source = 'ONLINE') {
    const n = bookings.length + 1;
    const slot = slots.find((s) => s.court_id === court.id && s.slot_date === addDays(today, day) && Number(s.start_time.slice(0, 2)) === hour);
    const venue = venues.find((v) => v.id === court.venue_id);
    const issue = !!refundStatus;
    const held_until = status === 'PENDING' ? new Date(now + 300000).toISOString() : null;
    slot.status = issue ? 'UNAVAILABLE' : status === 'PENDING' ? 'HELD' : status === 'EXPIRED' ? 'AVAILABLE' : 'BOOKED';
    slot.held_until = held_until;
    const b = {
      id: uuid(30, n), time_slot_id: slot.id, customer_id: customer?.id || null,
      customer_name: customer?.full_name || 'Khách tại quầy', customer_phone: customer?.phone || '0909876543',
      status, source, parent_booking_id: null, total_amount: slot.price,
      issue_reported_at: issue ? created_at : null, issue_reason: issue ? 'Hệ thống đèn cần sửa chữa.' : null,
      created_at, updated_at: created_at, court_name: court.name, venue_name: venue.name,
      start_at: slot.start_at, end_at: slot.end_at, court_id: court.id, venue_id: venue.id,
      sport_type: court.sport_type, held_until, refund_status: refundStatus,
      refund_id: refundStatus ? uuid(31, n) : null, review_id: null,
    };
    bookings.push(b);
    if (!['EXPIRED', 'PENDING'].includes(status)) payments.push({
      id: uuid(32, n), booking_id: b.id, method: source === 'ONLINE' ? 'BANK_TRANSFER' : 'CASH',
      transaction_code: `MOCK-HISTORY-${n}`, status: refundStatus === 'COMPLETED' ? 'REFUNDED' : 'PAID',
      amount: b.total_amount, created_at, updated_at: created_at,
    });
    if (status === 'PENDING') payments.push({
      id: uuid(32, n), booking_id: b.id, method: 'BANK_TRANSFER', transaction_code: `MOCK-PENDING-${n}`,
      status: 'PENDING', amount: b.total_amount, created_at, updated_at: created_at,
    });
    if (refundStatus) refunds.push({
      id: b.refund_id, booking_id: b.id, amount: b.total_amount, status: refundStatus,
      reason: b.issue_reason, requested_by: customer.id,
      processed_by: refundStatus === 'REQUESTED' ? null : venue.manager_id,
      created_at, updated_at: created_at,
    });
    return b;
  }
  venues.forEach((venue, v) => {
    const active = courts.filter((c) => c.venue_id === venue.id && c.status === 'ACTIVE');
    const customer = users[v];
    booking(active[0], customer, 'PENDING', 1, 10);
    const moved = booking(active[0], customer, 'CONFIRMED', 1, 18);
    const oldSlot = slots.find((s) => s.court_id === active[0].id && s.slot_date === addDays(today, 1) && s.start_time === '17:00:00');
    reschedules.push({
      id: uuid(35, v + 1), booking_id: moved.id, old_time_slot_id: oldSlot.id,
      new_time_slot_id: moved.time_slot_id, reason: 'Đổi lịch sau giờ làm.', is_venue_issue: false,
      requested_by: customer.id, processed_by: null, created_at,
    });
    const completed = booking(active[1], customer, 'COMPLETED', -1, 12);
    booking(active[1], customer, 'COMPLETED', -2, 12);
    completed.review_id = uuid(33, v + 1);
    reviews.push({ id: completed.review_id, booking_id: completed.id, rating: 5, comment: 'Sân sạch, hỗ trợ tốt.', created_at });
    booking(active[0], customer, 'EXPIRED', -1, 10);
    ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'].forEach((s, i) =>
      booking(active[2], customer, s === 'COMPLETED' ? 'CANCELLED_BY_VENUE' : 'CONFIRMED', 1, 14 + i, s));
    booking(active[3], null, 'CONFIRMED', 0, 20, null, 'WALK_IN');
    for (const hour of [14, 15]) {
      const issueOnly = booking(active[3], customer, 'CONFIRMED', 1, hour);
      issueOnly.issue_reported_at = created_at;
      issueOnly.issue_reason = 'Đèn sân hỏng, cơ sở đã báo sự cố.';
      slots.find((s) => s.id === issueOnly.time_slot_id).status = 'UNAVAILABLE';
    }
    const parent = booking(active[4], customer, 'CONFIRMED', 2, 18);
    const extension = booking(active[4], null, 'CONFIRMED', 2, 19, null, 'EXTENSION');
    extension.parent_booking_id = parent.id;
  });
  const audits = refunds.flatMap((refund) => {
    const steps = ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'];
    return steps.slice(0, steps.indexOf(refund.status) + 1).map((status, index) => ({
      id: uuid(34, refunds.indexOf(refund) * 4 + index + 1),
      actor_id: status === 'REQUESTED' ? refund.requested_by : refund.processed_by,
      actor_name: users.find((u) => u.id === (status === 'REQUESTED' ? refund.requested_by : refund.processed_by))?.full_name,
      action: `REFUND_${status}`, entity_type: 'refunds', entity_id: refund.id,
      before_data: index ? { status: steps[index - 1] } : null, after_data: { status },
      reason: refund.reason, created_at: new Date(now - (4 - index) * 60000).toISOString(),
    }));
  });
  return { users, venues, courts, slots, bookings, payments, refunds, reviews, reschedules, audits };
}
