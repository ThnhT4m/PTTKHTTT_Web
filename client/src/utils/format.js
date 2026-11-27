export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const money = (n) => new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
}).format(Number(n || 0));
const validDate = (value) => value && Number.isFinite(new Date(value).getTime());
export const dateVN = (value) => validDate(value) ? new Intl.DateTimeFormat('vi-VN', {
  timeZone: VN_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date(value)) : '—';
export const timeVN = (value) => validDate(value) ? new Intl.DateTimeFormat('vi-VN', {
  timeZone: VN_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value)) : '—';
export function todayVN(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function addDays(date, days) {
  const result = new Date(`${date}T12:00:00+07:00`);
  result.setUTCDate(result.getUTCDate() + days);
  return todayVN(result);
}
