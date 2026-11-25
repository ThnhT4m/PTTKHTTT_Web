import { ApiError } from '../api/errors.js';
import { addDays, todayVN } from '../utils/format.js';
import { metadataErrors, OPERATION_STATES, reasonError, scheduleErrors, validPrice, canEditSlotPrice } from '../utils/managerValidation.js';

const fail = (status, code, message, details) => { throw new ApiError({ code, message, details }, status); };
const invalid = (errors) => { if (Object.keys(errors).length) fail(400, 'VALIDATION_ERROR', Object.values(errors)[0], errors); };
function whitelist(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'VALIDATION_ERROR', 'Body phải là JSON object.');
  for (const key of Object.keys(body)) if (!keys.includes(key)) fail(400, 'VALIDATION_ERROR', `Trường không được hỗ trợ: ${key}.`);
}
function version(item, body) {
  if (!Number.isInteger(body.expected_version) || body.expected_version < 1) fail(400, 'VALIDATION_ERROR', 'expected_version phải là số nguyên >= 1.');
  if (body.expected_version !== item.version) fail(409, 'EDIT_CONFLICT', 'Dữ liệu đã được thay đổi. Vui lòng tải lại và kiểm tra trước khi xác nhận.', { current: structuredClone(item) });
}
export function writeCatalogue(db, { path, method, body, user, now }) {
  const parts = path.split('/').filter(Boolean), type = parts[0];
  const supported = (type === 'venues' && ((parts.length === 1 && method === 'POST') || (parts.length === 2 && ['PATCH', 'DELETE'].includes(method)) || (parts.length === 3 && ['status', 'courts', 'generate-slots'].includes(parts[2]) && method === (parts[2] === 'status' ? 'PATCH' : 'POST')))) ||
    (type === 'courts' && ((parts.length === 2 && ['PATCH', 'DELETE'].includes(method)) || (parts.length === 3 && parts[2] === 'status' && method === 'PATCH'))) ||
    (type === 'slots' && method === 'PATCH' && (parts.length === 2 || (parts.length === 3 && parts[2] === 'status')));
  if (!supported) return null;
  if (!['VENUE_MANAGER', 'ADMIN'].includes(user.role)) fail(403, 'FORBIDDEN', 'Chỉ quản lý đúng cơ sở hoặc ADMIN được thao tác.');
  const stamp = new Date(now).toISOString();
  const find = (rows, id) => rows.find((r) => r.id === id) || fail(404, 'NOT_FOUND', 'Không tìm thấy dữ liệu.');
  let item = parts[1] ? find(db[type], parts[1]) : null;
  const venue = item && (type === 'venues' ? item : find(db.venues, type === 'courts' ? item.venue_id : find(db.courts, item.court_id).venue_id));
  if (venue && user.role !== 'ADMIN' && venue.manager_id !== user.id) fail(403, 'FORBIDDEN', 'Cơ sở không thuộc phạm vi quản lý của bạn.');
  const audit = (action, entityType, record, before, reason) => db.audits.push({
    id: crypto.randomUUID(), actor_id: user.id, actor_name: user.full_name, action,
    entity_type: entityType, entity_id: record.id, before_data: before, after_data: structuredClone(record),
    reason: reason || null, created_at: stamp,
  });
  const activeBooking = (slotId) => db.bookings.some((b) => b.time_slot_id === slotId && ['PENDING', 'CONFIRMED', 'COMPLETED'].includes(b.status));
  const futureBooking = (courtIds) => db.bookings.some((b) => {
    const slot = db.slots.find((s) => s.id === b.time_slot_id);
    return slot && courtIds.includes(slot.court_id) && ['PENDING', 'CONFIRMED'].includes(b.status) && Date.parse(slot.end_at) > now;
  });
  if (parts[2] === 'generate-slots') {
    whitelist(body, ['start_date', 'days', 'court_ids']);
    const errors = scheduleErrors(body, now);
    if (Object.keys(errors).length) fail(400, errors.court_ids ? 'INVALID_COURTS' : 'INVALID_SCHEDULE_RANGE', Object.values(errors)[0], errors);
    if (venue.status !== 'ACTIVE') fail(409, 'VENUE_NOT_ACTIVE', 'Cơ sở phải hoạt động để sinh lịch.');
    if (body.court_ids?.some((id) => !db.courts.some((c) => c.id === id && c.venue_id === venue.id))) fail(400, 'INVALID_COURTS', 'Mọi sân phải thuộc cơ sở hiện tại.');
    const courts = db.courts.filter((c) => c.venue_id === venue.id && c.status === 'ACTIVE' && (!body.court_ids || body.court_ids.includes(c.id)));
    if (!courts.length) fail(409, 'NO_ACTIVE_COURTS', 'Không có sân ACTIVE phù hợp để sinh lịch.');
    const start = body.start_date ?? todayVN(now), days = body.days ?? 30;
    const existing = new Set(db.slots.map((s) => `${s.court_id}/${s.slot_date}/${s.start_time}`));
    let created = 0, skipped = 0;
    for (const court of courts) for (let day = 0; day < days; day++) for (let hour = 6; hour < 22; hour++) {
      const slot_date = addDays(start, day), start_time = `${String(hour).padStart(2, '0')}:00:00`, end_time = `${String(hour + 1).padStart(2, '0')}:00:00`;
      const key = `${court.id}/${slot_date}/${start_time}`;
      if (existing.has(key)) { skipped++; continue; }
      existing.add(key);
      db.slots.push({ id: crypto.randomUUID(), court_id: court.id, slot_date, start_time, end_time,
        start_at: new Date(`${slot_date}T${start_time}+07:00`).toISOString(), end_at: new Date(`${slot_date}T${end_time}+07:00`).toISOString(),
        price: court.hourly_price, status: 'AVAILABLE', held_until: null, version: 1, created_at: stamp, updated_at: stamp });
      created++;
    }
    const data = { venue_id: venue.id, start_date: start, end_date: addDays(start, days - 1), court_count: courts.length, created, skipped };
    audit('SLOTS_GENERATED', 'sport_venues', { id: venue.id, ...data }, null);
    return { data, status: 200 };
  }
  if (method === 'DELETE' || parts[2] === 'status') {
    whitelist(body, method === 'DELETE' ? ['expected_version', 'reason'] : ['expected_version', 'status', 'reason']);
    version(item, body);
    invalid(reasonError(body.reason) ? { reason: reasonError(body.reason) } : {});
    const status = method === 'DELETE' ? 'INACTIVE' : body.status;
    if (!(type === 'slots' ? ['AVAILABLE', 'UNAVAILABLE'] : OPERATION_STATES).includes(status)) fail(400, 'VALIDATION_ERROR', 'Trạng thái thủ công không hợp lệ.');
    if (type === 'slots') {
      if (['HELD', 'BOOKED'].includes(item.status) || activeBooking(item.id)) fail(409, 'SLOT_IN_USE', 'Ca đang có quyền giữ chỗ hoặc booking hiệu lực. Hãy xử lý đơn trước.');
    } else if (status !== 'ACTIVE') {
      const courtIds = type === 'venues' ? db.courts.filter((c) => c.venue_id === item.id).map((c) => c.id) : [item.id];
      if (futureBooking(courtIds)) fail(409, 'ACTIVE_BOOKINGS', 'Không thể ngưng hoạt động vì còn booking PENDING/CONFIRMED chưa kết thúc. Hãy xử lý các đơn trước.');
    }
    const before = structuredClone(item);
    Object.assign(item, { status, version: item.version + 1, updated_at: stamp });
    audit(method === 'DELETE' ? 'SOFT_DELETE' : 'STATUS_CHANGED', type === 'venues' ? 'sport_venues' : type === 'slots' ? 'time_slots' : type, item, before, body.reason.trim());
    return { data: item, status: 200 };
  }
  if (type === 'slots') {
    whitelist(body, ['expected_version', 'price']); version(item, body);
    if (!validPrice(body.price)) fail(400, 'VALIDATION_ERROR', 'Giá phải là số nguyên VND trong giới hạn cho phép.');
    if (!canEditSlotPrice(item, now) || activeBooking(item.id)) fail(409, 'SLOT_PRICE_LOCKED', 'Chỉ chỉnh giá ca chưa bắt đầu, AVAILABLE/UNAVAILABLE và không có booking hiệu lực.');
    const before = structuredClone(item);
    Object.assign(item, { price: body.price, version: item.version + 1, updated_at: stamp });
    audit('SLOT_PRICE_CHANGED', 'time_slots', item, before);
    return { data: item, status: 200 };
  }
  const createCourt = parts[2] === 'courts';
  const entityType = createCourt ? 'courts' : type;
  const fields = entityType === 'venues' ? ['name', 'address', 'district', 'description', 'payment_hold_minutes', 'minimum_online_booking_lead_minutes'] : ['name', 'sport_type', 'hourly_price', 'description'];
  whitelist(body, [...fields, ...(method === 'PATCH' ? ['expected_version'] : [])]);
  if (method === 'PATCH') version(item, body);
  invalid(metadataErrors(entityType, body, method === 'PATCH'));
  const values = Object.fromEntries(fields.filter((key) => Object.hasOwn(body, key)).map((key) => [key, typeof body[key] === 'string' && key !== 'description' ? body[key].trim() : body[key]]));
  if (method === 'POST') {
    item = { id: crypto.randomUUID(), status: 'ACTIVE', version: 1, description: null,
      ...(entityType === 'venues' ? { manager_id: user.id, payment_hold_minutes: 5, minimum_online_booking_lead_minutes: 10 } : { venue_id: venue.id }),
      ...values, created_at: stamp, updated_at: stamp };
    db[entityType].push(item);
    audit('CREATED', entityType === 'venues' ? 'sport_venues' : entityType, item, null);
    return { data: item, status: 201 };
  }
  const before = structuredClone(item);
  Object.assign(item, values, { version: item.version + 1, updated_at: stamp });
  audit('UPDATED', type === 'venues' ? 'sport_venues' : type, item, before);
  return { data: item, status: 200 };
}
