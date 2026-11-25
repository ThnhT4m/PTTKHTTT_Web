import { useEffect, useRef } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  X,
  ArrowUpRight,
  Clock3,
} from 'lucide-react';
import { money, dateVN, timeVN } from '../utils/format.js';
import { canAccess } from '../utils/roles.js';
import { useAuth, homeFor } from '../contexts/AuthContext';
export const SPORTS = {
  FOOTBALL: 'Bóng đá',
  BADMINTON: 'Cầu lông',
  TENNIS: 'Tennis',
  PICKLEBALL: 'Pickleball',
  BASKETBALL: 'Bóng rổ',
};
export { money, dateVN, timeVN, todayVN } from '../utils/format.js';
export { useResource } from '../hooks/useResource.js';
export const labels = {
  AVAILABLE: 'Còn trống',
  HELD: 'Đang giữ chỗ',
  BOOKED: 'Đã đặt',
  UNAVAILABLE: 'Ngưng phục vụ',
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  MAINTENANCE: 'Bảo trì',
  PENDING: 'Chờ thanh toán',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Hoàn thành',
  EXPIRED: 'Hết hạn',
  CANCELLED_BY_VENUE: 'Sân đã hủy',
  REQUESTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  PROCESSING: 'Đang hoàn tiền',
  PAID: 'Đã thanh toán',
  REFUNDED: 'Đã hoàn tiền',
  FAILED: 'Thất bại',
  ONLINE: 'Online',
  WALK_IN: 'Tại quầy',
  EXTENSION: 'Gia hạn',
  CUSTOMER: 'Khách hàng',
  VENUE_MANAGER: 'Quản lý cơ sở',
  ADMIN: 'Quản trị viên',
};
export function StatusBadge({ status, refund = false }) {
  return (
    <span className={`badge badge--${status}`}>
      {refund && status === 'COMPLETED' ? 'Đã hoàn tiền' : labels[status] || status}
    </span>
  );
}
export function Notice({ children, type = 'error' }) {
  if (!children) return null;
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={`notice notice--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <Icon size={18} />
      <span>{children}</span>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> Đang tải dữ liệu…
    </div>
  );
}
export function Empty({ children = 'Chưa có dữ liệu.', action }) {
  return (
    <div className="empty-state">
      <Clock3 size={32} />
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className="page-header">
      <div>
        <p className="page-header__eyebrow">{eyebrow}</p>
        <h1 className="page-header__title">{title}</h1>
        {description && <p className="page-header__description">{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}
export function Protected({ roles }) {
  const { user, loading, sessionError, retrySession } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (sessionError) return (
    <>
      <Notice>{sessionError}</Notice>
      <button className="button button--secondary" onClick={retrySession}>
        Thử lại phiên đăng nhập
      </button>
    </>
  );
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (!canAccess(user, roles)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
export function Modal({ title, children, onClose }) {
  const container = useRef(null), close = useRef(onClose), previous = useRef(document.activeElement);
  close.current = onClose;
  useEffect(() => {
    const focusable = () => [...(container.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]') || [])].filter((node) => node.getClientRects().length);
    if (!container.current?.contains(document.activeElement)) focusable()[0]?.focus();
    const handle = (e) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const items = focusable(), first = items[0], last = items.at(-1);
        if (!items.length) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || !container.current?.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handle);
      document.body.style.overflow = old;
      if (previous.current?.isConnected) previous.current.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section ref={container} className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  );
}
export function VenueCard({ venue, from }) {
  const sports = venue.sport_types || [];
  return (
    <article className="venue-card">
      <div className={`venue-card__art venue-card__art--${sports[0] || 'FOOTBALL'}`}>
        <div className="court-art">
          <span className="court-art__circle" />
          <span className="court-art__net" />
        </div>
        <span className="venue-card__art-label">{venue.district}</span>
      </div>
      <div className="venue-card__body">
        <div className="venue-card__eyebrow">
          {sports.map((s) => SPORTS[s] || s).join(' · ') || 'Thể thao đa bộ môn'}
        </div>
        <h3 className="venue-card__name">{venue.name}</h3>
        <p className="venue-card__location">
          <MapPin size={15} />
          {venue.address}
        </p>
        <div className="venue-card__footer">
          <span>
            {venue.min_price !== undefined && venue.min_price !== null ? (
              <>
                <strong>{money(venue.min_price)}</strong>
                <small> / giờ</small>
              </>
            ) : (
              <StatusBadge status={venue.status} />
            )}
          </span>
          <Link className="button button--ghost button--small" to={`/venues/${venue.id}`} state={from ? { catalog: from } : undefined}>
            Xem sân <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>
    </article>
  );
}
export function SlotLegend() {
  return (
    <div className="legend">
      {['AVAILABLE', 'HELD', 'BOOKED', 'UNAVAILABLE'].map((s) => (
        <span className="legend__item" key={s}>
          <i className={`legend__dot legend__dot--${s}`} />
          {labels[s]}
        </span>
      ))}
    </div>
  );
}
export function SlotGrid({ slots, onSelect, disabled = false, admin = false }) {
  return (
    <div className="slot-grid">
      {slots.map((s) => (
        <button
          className={`slot-card slot-card--${s.status}`}
          key={s.id}
          onClick={() => onSelect?.(s)}
          disabled={
            disabled || (!admin && (s.status !== 'AVAILABLE' || new Date(s.end_at) <= new Date()))
          }
        >
          <span className="slot-card__time">
            {s.start_time?.slice(0, 5) || timeVN(s.start_at)} –{' '}
            {s.end_time?.slice(0, 5) || timeVN(s.end_at)}
          </span>
          <span className="slot-card__price">{money(s.price)}</span>
          <small>{labels[s.status]}</small>
        </button>
      ))}
    </div>
  );
}
export function BookingSummary({ booking }) {
  return (
    <dl className="summary-list">
      <div className="summary-list__row">
        <dt>Cơ sở</dt>
        <dd>{booking.venue_name || '—'}</dd>
      </div>
      <div className="summary-list__row">
        <dt>Sân</dt>
        <dd>{booking.court_name || '—'}</dd>
      </div>
      <div className="summary-list__row">
        <dt>Ngày</dt>
        <dd>{dateVN(booking.start_at)}</dd>
      </div>
      <div className="summary-list__row">
        <dt>Khung giờ</dt>
        <dd>
          {timeVN(booking.start_at)} – {timeVN(booking.end_at)}
        </dd>
      </div>
      <div className="summary-list__row summary-list__row--total">
        <dt>Tổng tiền</dt>
        <dd>{money(booking.total_amount)}</dd>
      </div>
    </dl>
  );
}
export function errorMessage(error) {
  return error.status === 409 && /CONFLICT/.test(error.code || '')
    ? `${error.message} Dữ liệu đã thay đổi. Hãy đóng biểu mẫu, tải lại và thử lại.`
    : error.message;
}
