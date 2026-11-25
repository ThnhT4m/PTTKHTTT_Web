import { ApiError } from '../api/errors.js';
import { authErrors, isISODate } from '../utils/validation.js';
import { todayVN } from '../utils/format.js';
import { DEMO_PASSWORD } from './data.js';
import { writeCatalogue } from './catalogue.js';
import { createMockStore } from './store.js';
import { writeCustomer, expireHolds, customerAudit } from './customer.js';
import { hashMockPassword, verifyMockPassword } from './password.js';

const SESSION_KEY = 'sportbooking.mock.sessions.v1';
const fail = (status, code, message, details) => { throw new ApiError({ code, message, details }, status); };
const unsupported = () => fail(501, 'MOCK_NOT_IMPLEMENTED', 'Chế độ mock chưa hỗ trợ nghiệp vụ này trong phạm vi TASK 1–3. Không có dữ liệu nào được thay đổi.');
const readJSON = (storage, key, fallback) => {
  try { return JSON.parse(storage?.getItem(key)) || fallback; } catch { return fallback; }
};

export function createMockTransport({ storage, now = Date.now } = {}) {
  const store = createMockStore(storage, now);
  let db = store.read();
  let sessions = readJSON(storage, SESSION_KEY, {});
  const saveSessions = () => storage?.setItem(SESSION_KEY, JSON.stringify(sessions));
  const requireUser = (user) => user || fail(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập bằng tài khoản demo.');
  const requireRole = (user, roles) => {
    requireUser(user);
    if (!roles.includes(user.role)) fail(403, 'FORBIDDEN', 'Tài khoản không có quyền truy cập dữ liệu này.');
  };
  const find = (rows, id) => rows.find((row) => row.id === id) || fail(404, 'NOT_FOUND', 'Không tìm thấy dữ liệu.');
  const ownsVenue = (user, venueId) => user.role === 'ADMIN' ||
    db.venues.some((v) => v.id === venueId && v.manager_id === user.id);
  const canReadBooking = (user, booking) => user.role === 'CUSTOMER'
    ? booking.customer_id === user.id : ownsVenue(user, booking.venue_id);
  const checkedBooking = (user, id) => {
    requireUser(user);
    const b = find(db.bookings, id);
    if (!canReadBooking(user, b)) fail(403, 'FORBIDDEN', 'Đơn không thuộc phạm vi của bạn.');
    return b;
  };
  function page(rows, q, filters = []) {
    for (const key of q.keys()) if (!['limit', 'offset', ...filters].includes(key))
      fail(400, 'VALIDATION_ERROR', `Bộ lọc không được hỗ trợ: ${key}.`);
    const integer = (key, fallback, min, max) => {
      if (!q.has(key)) return fallback;
      if (!/^\d+$/.test(q.get(key))) fail(400, 'VALIDATION_ERROR', `${key} phải là số nguyên.`);
      const value = Number(q.get(key));
      if (value < min || value > max) fail(400, 'VALIDATION_ERROR', `${key} nằm ngoài giới hạn.`);
      return value;
    };
    const limit = integer('limit', 100, 1, 300), offset = integer('offset', 0, 0, 1000000);
    return [...rows].sort((a, b) => a.id.localeCompare(b.id)).slice(offset, offset + limit);
  }
  function boolean(q, key) {
    if (q.has(key) && !['true', 'false'].includes(q.get(key))) fail(400, 'VALIDATION_ERROR', `${key} phải là true hoặc false.`);
    return q.get(key) === 'true';
  }
  function enumQuery(q, key, values) {
    if (q.has(key) && !values.includes(q.get(key))) fail(400, 'VALIDATION_ERROR', `${key} không hợp lệ.`);
  }
  function priceFilter(courts, q) {
    enumQuery(q, 'sport_type', ['FOOTBALL', 'BADMINTON', 'TENNIS', 'PICKLEBALL', 'BASKETBALL']);
    for (const key of ['min_price', 'max_price']) if (q.has(key) &&
      (!/^\d+$/.test(q.get(key)) || !Number.isSafeInteger(Number(q.get(key)))))
      fail(400, 'VALIDATION_ERROR', 'Giá phải là số nguyên VND không âm.');
    if (q.has('min_price') && q.has('max_price') && Number(q.get('min_price')) > Number(q.get('max_price')))
      fail(400, 'VALIDATION_ERROR', 'Giá tối thiểu phải nhỏ hơn hoặc bằng giá tối đa.');
    return courts.filter((c) => (!q.has('sport_type') || c.sport_type === q.get('sport_type')) &&
      (!q.has('min_price') || c.hourly_price >= Number(q.get('min_price'))) &&
      (!q.has('max_price') || c.hourly_price <= Number(q.get('max_price'))));
  }
  function visibleCourts(user, venueId) {
    const privileged = user && ownsVenue(user, venueId);
    return db.courts.filter((c) => c.venue_id === venueId && (privileged || c.status === 'ACTIVE'));
  }
  function commit(staged) {
    try { store.commit(staged); }
    catch { fail(503, 'MOCK_STORAGE_FULL', 'Không thể lưu dữ liệu mock. Bộ nhớ trình duyệt có thể đã đầy; thao tác chưa được ghi nhận.'); }
    db = staged;
  }
  async function route(path, method, body, token, response) {
    const url = new URL(path, 'http://mock.local');
    const parts = url.pathname.split('/').filter(Boolean), q = url.searchParams;
    sessions = readJSON(storage, SESSION_KEY, sessions);
    db = store.read();
    const record = sessions[token];
    const user = record && record.expires > now() ? db.users.find((u) => u.id === record.userId && u.is_active) : null;
    if (db.bookings.some((b) => b.status === 'PENDING' && Date.parse(b.held_until) <= now())) {
      const staged = structuredClone(db); expireHolds(staged, now()); commit(staged);
    }
    // List/detail display names follow the shared catalogue; booking amounts remain snapshots.
    for (const booking of db.bookings) {
      const court = db.courts.find((c) => c.id === booking.court_id);
      const venue = db.venues.find((v) => v.id === booking.venue_id);
      if (court) { booking.court_name = court.name; booking.sport_type = court.sport_type; }
      if (venue) booking.venue_name = venue.name;
    }
    if (method === 'POST' && url.pathname === '/auth/login') {
      const errors = authErrors(body || {});
      if (Object.keys(errors).length) fail(400, 'VALIDATION_ERROR', Object.values(errors)[0], errors);
      const account = db.users.find((u) => u.email === body.email.toLowerCase());
      const valid = account && (db.credentials?.[account.id] ? await verifyMockPassword(body.password, db.credentials[account.id]) : body.password === DEMO_PASSWORD);
      if (!valid) fail(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
      if (!account.is_active) fail(403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.');
      const newToken = `mock.${globalThis.crypto.randomUUID()}`;
      sessions[newToken] = { userId: account.id, expires: now() + 86400000 };
      saveSessions();
      return { user: account, token: newToken };
    }
    if (method === 'POST' && url.pathname === '/auth/register') {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['full_name', 'email', 'phone', 'password'].includes(key))) fail(400, 'VALIDATION_ERROR', 'Đăng ký chỉ nhận họ tên, email, điện thoại và mật khẩu.');
      const errors = authErrors(body, true);
      if (Object.keys(errors).length) fail(400, 'VALIDATION_ERROR', Object.values(errors)[0], errors);
      const credential = await hashMockPassword(body.password);
      db = store.read();
      const email = body.email.trim().toLowerCase();
      if (db.users.some((u) => u.email.toLowerCase() === email)) fail(409, 'EMAIL_EXISTS', 'Email đã được đăng ký.', { email: 'Email đã được sử dụng.' });
      const staged = structuredClone(db), stamp = new Date(now()).toISOString();
      const account = { id: crypto.randomUUID(), full_name: body.full_name.trim(), email, phone: body.phone || null, role: 'CUSTOMER', is_active: true, created_at: stamp, updated_at: stamp };
      staged.users.push(account); staged.credentials ||= {}; staged.credentials[account.id] = credential;
      customerAudit(staged, account, 'USER_REGISTERED', 'users', account, null, now());
      commit(staged); response.status = 201;
      return { user: account };
    }
    if (url.pathname === '/auth/me' && method === 'GET') return { user: requireUser(user) };
    if (url.pathname === '/auth/logout' && method === 'POST') {
      requireUser(user);
      Object.keys(sessions).forEach((key) => { if (sessions[key].userId === user.id) delete sessions[key]; });
      saveSessions();
      return { message: 'Đã đăng xuất.' };
    }
    if (method !== 'GET') {
      requireUser(user);
      // Stage the write and its audit together; failed validation never alters the store.
      const staged = structuredClone(db);
      const args = { path: url.pathname, method, body, user, now: now() };
      const result = writeCatalogue(staged, args) || writeCustomer(staged, args);
      if (result) {
        commit(staged);
        response.status = result.status;
        return result.data;
      }
      return unsupported();
    }
    if (url.pathname === '/venues') {
      const mine = boolean(q, 'mine');
      if (mine) requireRole(user, ['VENUE_MANAGER', 'ADMIN']);
      const matched = priceFilter(db.courts.filter((c) => c.status === 'ACTIVE'), q);
      const search = (value, filter) => value.toLocaleLowerCase('vi').includes((filter || '').toLocaleLowerCase('vi'));
      const rows = db.venues.filter((v) => (!mine || ownsVenue(user, v.id)) && (mine || user?.role === 'ADMIN' || v.status === 'ACTIVE') &&
        search(`${v.name} ${v.address}`, q.get('q')) && search(v.district, q.get('district')) &&
        (!['sport_type', 'min_price', 'max_price'].some((k) => q.has(k)) || matched.some((c) => c.venue_id === v.id)))
        .map((v) => {
          const courts = visibleCourts(user, v.id);
          return { ...v, sport_types: [...new Set(courts.map((c) => c.sport_type))], min_price: courts.length ? Math.min(...courts.map((c) => c.hourly_price)) : null };
        });
      return page(rows, q, ['q', 'district', 'sport_type', 'min_price', 'max_price', 'mine']);
    }
    if (parts[0] === 'venues' && parts[1] && parts.length <= 3) {
      const venue = find(db.venues, parts[1]);
      if (parts.length === 2) return { ...venue, courts: visibleCourts(user, venue.id) };
      if (parts[2] === 'courts') return page(priceFilter(visibleCourts(user, venue.id), q), q, ['sport_type', 'min_price', 'max_price']);
    }
    if (parts[0] === 'courts' && parts[1] && parts.length <= 3) {
      const court = find(db.courts, parts[1]);
      if (court.status !== 'ACTIVE' && (!user || !ownsVenue(user, court.venue_id))) fail(404, 'NOT_FOUND', 'Sân không phục vụ.');
      if (parts.length === 2) return { ...court, venue_name: find(db.venues, court.venue_id).name };
      if (parts[2] === 'slots') {
        const date = q.get('date') || todayVN(now());
        if (!isISODate(date)) fail(400, 'VALIDATION_ERROR', 'Ngày phải hợp lệ theo YYYY-MM-DD.');
        return db.slots.filter((s) => s.court_id === court.id && s.slot_date === date);
      }
    }
    if (parts[0] === 'bookings') {
      requireUser(user);
      if (parts.length === 1) {
        enumQuery(q, 'status', ['PENDING', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELLED_BY_VENUE']);
        enumQuery(q, 'source', ['ONLINE', 'WALK_IN', 'EXTENSION']);
        enumQuery(q, 'refund_status', ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED']);
        if (q.has('date') && !isISODate(q.get('date'))) fail(400, 'VALIDATION_ERROR', 'Ngày không hợp lệ.');
        const issue = boolean(q, 'has_issue');
        const rows = db.bookings.filter((b) => canReadBooking(user, b) &&
          ['status', 'source', 'venue_id', 'court_id', 'refund_status'].every((key) => !q.has(key) || b[key] === q.get(key)) &&
          (!q.has('date') || todayVN(b.start_at) === q.get('date')) &&
          (!q.has('has_issue') || !!b.issue_reported_at === issue));
        return page(rows, q, ['status', 'source', 'venue_id', 'court_id', 'date', 'has_issue', 'refund_status']);
      }
      const b = checkedBooking(user, parts[1]);
      if (parts.length === 2) return b;
      if (parts.length === 3 && parts[2] === 'history') return {
        booking: b, payments: db.payments.filter((p) => p.booking_id === b.id),
        reschedules: db.reschedules.filter((r) => r.booking_id === b.id),
        refund: db.refunds.find((r) => r.booking_id === b.id) || null,
        review: db.reviews.find((r) => r.booking_id === b.id) || null,
      };
    }
    if (parts[0] === 'refunds') {
      requireUser(user);
      if (parts.length === 2) {
        const refund = find(db.refunds, parts[1]);
        checkedBooking(user, refund.booking_id);
        return refund;
      }
      if (parts.length === 1) {
        enumQuery(q, 'status', ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED']);
        return page(db.refunds.filter((r) => {
          const b = find(db.bookings, r.booking_id);
          return canReadBooking(user, b) && (!q.has('venue_id') || b.venue_id === q.get('venue_id')) &&
            (!q.has('booking_id') || r.booking_id === q.get('booking_id')) && (!q.has('status') || r.status === q.get('status'));
        }), q, ['status', 'booking_id', 'venue_id']);
      }
    }
    if (parts[0] === 'admin') {
      requireRole(user, ['ADMIN']);
      if (url.pathname === '/admin/overview') return {
        total_venues: db.venues.length, total_bookings: db.bookings.length, total_users: db.users.length,
        total_revenue: db.payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0),
      };
      if (url.pathname === '/admin/users') {
        enumQuery(q, 'role', ['CUSTOMER', 'VENUE_MANAGER', 'ADMIN']);
        const active = boolean(q, 'is_active');
        return page(db.users.filter((u) => (!q.has('role') || u.role === q.get('role')) &&
          (!q.has('is_active') || u.is_active === active) &&
          (!q.has('q') || `${u.full_name} ${u.email}`.toLowerCase().includes(q.get('q').toLowerCase()))), q, ['q', 'role', 'is_active']);
      }
      if (url.pathname === '/admin/audit-logs') return page(db.audits.filter((a) =>
        ['actor_id', 'entity_id', 'action'].every((k) => !q.has(k) || a[k] === q.get(k))), q, ['actor_id', 'entity_id', 'action']);
    }
    fail(404, 'MOCK_ROUTE_NOT_FOUND', 'Mock chưa có API đọc tại đường dẫn này.');
  }
  return async (path, { method = 'GET', body, token, signal } = {}) => {
    signal?.throwIfAborted();
    const response = { status: 200 };
    try {
      const data = await route(path, method, body, token, response);
      return { status: response.status, payload: { success: true, data: structuredClone(data), server_time: new Date(now()).toISOString() } };
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return { status: error.status, payload: { success: false, error: { code: error.code, message: error.message, details: error.details }, server_time: new Date(now()).toISOString() } };
    }
  };
}
