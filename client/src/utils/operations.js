import { isISODate } from './validation.js';
export const COUNTER_METHODS = ['CASH', 'BANK_TRANSFER'];
export function walkInErrors(values) {
  const errors = {};
  if (typeof values.customer_name !== 'string' || values.customer_name.trim().length < 2 || values.customer_name.trim().length > 120) errors.customer_name = 'Tên khách cần 2–120 ký tự.';
  if (values.customer_phone !== undefined && (typeof values.customer_phone !== 'string' || values.customer_phone.trim().length > 30)) errors.customer_phone = 'Điện thoại tối đa 30 ký tự.';
  if (!COUNTER_METHODS.includes(values.method)) errors.method = 'Chọn tiền mặt hoặc chuyển khoản tại quầy.';
  return errors;
}
export function walkInReason(slot, court, venue, now) {
  if (!court || !venue) return 'Đang tải cấu hình cơ sở/sân.';
  if (court.status !== 'ACTIVE' || venue.status !== 'ACTIVE') return 'Cơ sở/sân không hoạt động.';
  if (slot.status !== 'AVAILABLE') return 'Ca không còn trống.';
  if (Date.parse(slot.end_at) <= now) return 'Ca đã kết thúc.';
  return '';
}
export function slotPhase(slot, now) {
  return Date.parse(slot.end_at) <= now ? 'Đã kết thúc' : Date.parse(slot.start_at) <= now ? 'Đang diễn ra' : 'Chưa bắt đầu';
}
export function nextSlot(booking, slots) {
  return slots?.find((s) => s.court_id === booking.court_id && Date.parse(s.start_at) === Date.parse(booking.end_at)) || null;
}
export const canComplete = (booking, now) => booking?.status === 'CONFIRMED' && !booking.issue_reported_at && Date.parse(booking.end_at) <= now;
export const validDateFilter = (date) => date === '' || isISODate(date);
