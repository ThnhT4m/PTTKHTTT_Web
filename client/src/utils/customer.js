import { homeFor } from './roles.js';
import { isISODate, isVND } from './validation.js';
export const PAGE_SIZE = 12;
export const BOOKING_STATES = ['PENDING', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELLED_BY_VENUE'];
export function customerReturnPath(path, role) {
  if (role !== 'CUSTOMER' || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return homeFor(role);
  const url = new URL(path, 'http://local');
  const valid = /^\/(venues(?:\/[^/]+)?|courts\/[^/]+\/schedule|checkout\/[^/]+|my-bookings)\/?$/.test(url.pathname);
  return valid ? url.pathname + url.search : '/venues';
}
export function fieldErrors(error) {
  const details = error?.details;
  if (!details) return {};
  if (details.fieldErrors) return Object.fromEntries(Object.entries(details.fieldErrors).map(([key, value]) => [key, Array.isArray(value) ? value.join(' ') : String(value)]));
  const issues = Array.isArray(details) ? details : details.issues || details.errors;
  if (Array.isArray(issues)) return Object.fromEntries(issues.filter((e) => e.path?.length).map((e) => [e.path[0], e.message]));
  return Object.fromEntries(Object.entries(details).filter(([, value]) => typeof value === 'string'));
}
export function priceRangeError(min, max) {
  if ([min, max].some((v) => v !== '' && !isVND(Number(v)))) return 'Giá phải là số nguyên VND không âm.';
  return min !== '' && max !== '' && Number(min) > Number(max) ? 'Giá tối thiểu không được vượt giá tối đa.' : '';
}
export function onlineSlotReason(slot, court, venue, now) {
  if (!court || !venue) return 'Đang tải cấu hình cơ sở.';
  if (court.status !== 'ACTIVE' || venue.status !== 'ACTIVE') return 'Sân hoặc cơ sở hiện không phục vụ.';
  if (slot.status !== 'AVAILABLE') return 'Ca không còn trống.';
  if (Date.parse(slot.start_at) - now < Number(venue.minimum_online_booking_lead_minutes ?? 10) * 60000)
    return `Cần đặt trước ít nhất ${venue.minimum_online_booking_lead_minutes ?? 10} phút; ca này đã bắt đầu hoặc quá sát giờ.`;
  return '';
}
export function canReschedule(booking, now = Date.now()) {
  return booking?.status === 'CONFIRMED' && !booking.refund_status && (!!booking.issue_reported_at || Date.parse(booking.start_at) > now);
}
export const canRequestRefund = (booking) => booking?.status === 'CONFIRMED' && !!booking.issue_reported_at && !booking.refund_status;
export const canReview = (booking) => booking?.status === 'COMPLETED' && !booking.review_id;
export function validScheduleDate(value, today) { return isISODate(value) && value >= today; }
