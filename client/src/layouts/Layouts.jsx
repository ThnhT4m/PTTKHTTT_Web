import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  LayoutDashboard,
  MapPin,
  LogOut,
  ShieldCheck,
  CircleDot,
  ArrowUpRight,
  ReceiptText,
  PanelLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
export function Brand() {
  return (
    <Link to="/venues" className="brand" aria-label="Sân Nhà — trang chủ">
      <span className="brand__mark">
        <CircleDot size={25} />
      </span>
      <span className="brand__text">
        sân nhà<span className="brand__sub">CÙNG CHƠI. CÙNG KẾT NỐI.</span>
      </span>
    </Link>
  );
}
function UserMenu() {
  const { user, loading, sessionError, retrySession, logout } = useAuth();
  const navigate = useNavigate();
  if (loading) return <span className="header-session" role="status">Đang kiểm tra phiên…</span>;
  if (sessionError) return <div className="header-session"><span role="alert">Chưa xác minh được phiên: {sessionError}</span><button className="button button--secondary button--small" onClick={retrySession}>Thử lại phiên đăng nhập</button></div>;
  return user ? (
    <div className="header-user">
      <span className="avatar">{user.full_name?.slice(0, 1)}</span>
      <span>{user.full_name}</span>
      <button
        className="icon-button"
        title="Đăng xuất"
        onClick={async () => {
          await logout().catch(() => {});
          navigate('/login');
        }}
      >
        <LogOut size={18} />
      </button>
    </div>
  ) : (
    <Link className="button button--primary button--small" to="/login">
      Đăng nhập <ArrowUpRight size={16} />
    </Link>
  );
}
export function CustomerLayout() {
  const { user } = useAuth();
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container site-header__inner">
          <Brand />
          <nav className="site-nav">
            <NavLink to="/venues">Khám phá sân</NavLink>
            {user?.role === 'CUSTOMER' && <NavLink to="/my-bookings">Lịch đặt của tôi</NavLink>}
            {user?.role === 'VENUE_MANAGER' && <Link to="/manager/venues">Quản lý cơ sở</Link>}
            {user?.role === 'ADMIN' && <Link to="/admin">Quản trị hệ thống</Link>}
          </nav>
          <UserMenu />
        </div>
      </header>
      <main className="container main-content">
        <Outlet />
      </main>
      <footer className="footer container">
        <span>© 2026 Sân Nhà · Hệ thống đặt sân đa cơ sở</span>
        <span>
          <MapPin size={14} /> Thành phố Hồ Chí Minh
        </span>
      </footer>
    </div>
  );
}
const managerLinks = [
  { to: '/manager/venues', label: 'Cơ sở & sân', Icon: MapPin },
  { to: '/manager/counter', label: 'Quầy thu ngân', Icon: CalendarDays },
  { to: '/manager/requests', label: 'Sự cố & hoàn tiền', Icon: ReceiptText },
];
const adminLinks = [{ to: '/admin', label: 'Quản trị hệ thống', Icon: LayoutDashboard, end: true }];
export function DashboardLayout({ admin = false }) {
  return (
    <div className="dashboard">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar__label">{admin ? 'QUẢN TRỊ HỆ THỐNG' : 'KHÔNG GIAN QUẢN LÝ'}</div>
        <nav className="sidebar__nav">
          {(admin ? adminLinks : managerLinks).map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <ShieldCheck size={20} />
          <p>
            Phân quyền theo cơ sở<span>Mỗi thay đổi đều được bảo vệ.</span>
          </p>
        </div>
        <Link className="button button--ghost" to="/venues">
          Xem trang khách hàng <ArrowUpRight size={17} />
        </Link>
      </aside>
      <div className="dashboard__main">
        <header className="topbar">
          <span className="topbar__label">
            <PanelLeft size={18} />
            {admin ? 'Quản trị viên' : 'Quản lý cơ sở'}
          </span>
          <UserMenu />
        </header>
        <main className="dashboard__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
