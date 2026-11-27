import { isISODate, isVND } from './validation.js';
import { addDays, todayVN } from './format.js';

export const SPORTS = ['FOOTBALL', 'BADMINTON', 'TENNIS', 'PICKLEBALL', 'BASKETBALL'];
export const OPERATION_STATES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];
// Metadata bounds match the Backend request schemas.
export const MAX_PRICE = 100000000;
export function metadataErrors(type, values, partial = false) {
  const errors = {};
  const text = (key, min, max) => {
    if (partial && !Object.hasOwn(values, key)) return;
    if (typeof values[key] !== 'string' || values[key].trim().length < min || values[key].trim().length > max)
      errors[key] = `${key === 'name' ? 'Tên' : key === 'address' ? 'Địa chỉ' : 'Quận / huyện'} cần từ ${min} đến ${max} ký tự.`;
  };
  text('name', 2, type === 'venues' ? 150 : 120);
  if (type === 'venues') {
    text('address', 3, 300); text('district', 1, 100);
    for (const [key, min, max] of [['payment_hold_minutes', 1, 10], ['minimum_online_booking_lead_minutes', 10, 1440]]) {
      if (values[key] !== undefined && (!Number.isInteger(values[key]) || values[key] < min || values[key] > max))
        errors[key] = `${key === 'payment_hold_minutes' ? 'Giữ chỗ' : 'Thời gian đặt trước'} phải là số nguyên ${min}–${max} phút.`;
    }
  } else {
    if ((!partial || Object.hasOwn(values, 'sport_type')) && !SPORTS.includes(values.sport_type)) errors.sport_type = 'Bộ môn không hợp lệ.';
    if ((!partial || Object.hasOwn(values, 'hourly_price')) && !validPrice(values.hourly_price)) errors.hourly_price = `Giá phải là số nguyên từ 0 đến ${MAX_PRICE.toLocaleString('vi-VN')} VND.`;
  }
  if (values.description !== undefined && values.description !== null && (typeof values.description !== 'string' || values.description.length > 2000)) errors.description = 'Mô tả tối đa 2000 ký tự.';
  return errors;
}
export const validPrice = (value) => isVND(value) && value <= MAX_PRICE;
export const reasonError = (value) => typeof value === 'string' && value.trim().length >= 5 && value.trim().length <= 1000 ? '' : 'Lý do cần từ 5 đến 1000 ký tự sau khi bỏ khoảng trắng đầu/cuối.';
export function scheduleErrors(values, now = Date.now()) {
  const errors = {}, start = values.start_date === undefined ? todayVN(now) : values.start_date, days = values.days === undefined ? 30 : values.days;
  if (!isISODate(start) || start < todayVN(now)) errors.start_date = 'Ngày bắt đầu phải hợp lệ và không trước hôm nay (giờ Việt Nam).';
  if (!Number.isInteger(days) || days < 1 || days > 30) errors.days = 'Số ngày phải là số nguyên từ 1 đến 30.';
  if (!errors.start_date && !errors.days && addDays(start, days - 1) > addDays(todayVN(now), 30)) errors.range = 'Ngày cuối không được vượt quá hôm nay cộng 30 ngày.';
  if (values.court_ids !== undefined && (!Array.isArray(values.court_ids) || !values.court_ids.length || values.court_ids.length > 100 || new Set(values.court_ids).size !== values.court_ids.length || values.court_ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))) errors.court_ids = 'Chọn 1–100 sân, ID hợp lệ và không trùng.';
  return errors;
}
export function canEditSlotPrice(slot, now = Date.now()) {
  return ['AVAILABLE', 'UNAVAILABLE'].includes(slot.status) && Date.parse(slot.start_at) > now;
}
export const canChangeSlotStatus = (slot) => ['AVAILABLE', 'UNAVAILABLE'].includes(slot.status);
