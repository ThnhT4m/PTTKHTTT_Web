import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CircleDot } from 'lucide-react';
import { useAuth, homeFor } from '../../contexts/AuthContext';
import { Brand } from '../../layouts/Layouts';
import { Field, Notice } from '../../components/shared';
export default function AuthPage({ register = false }) {
  const { user, login, register: signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const logged = await (register ? signUp(values) : login(values));
      navigate(
        logged.role === 'CUSTOMER' && location.state?.from
          ? location.state.from
          : homeFor(logged.role),
        { replace: true },
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-card">
        <aside className="auth-card__aside">
          <Brand />
          <div>
            <span className="chip">HẸN NHAU TRÊN SÂN</span>
            <h1>
              Một trận hay.
              <br />
              Một ngày tốt.
            </h1>
            <p>Tìm sân phù hợp, chọn giờ bạn muốn và dành thời gian cho điều mình yêu thích.</p>
            <ul>
              <li>
                <Check size={18} />
                Nhiều cơ sở, nhiều bộ môn
              </li>
              <li>
                <Check size={18} />
                Lịch sân cập nhật theo giao dịch
              </li>
              <li>
                <Check size={18} />
                Đặt chỗ và thanh toán thuận tiện
              </li>
            </ul>
          </div>
          <CircleDot className="auth-card__ball" size={130} />
        </aside>
        <div className="auth-card__form">
          <Link className="text-link" to="/venues">
            ← Khám phá sân
          </Link>
          <p className="page-header__eyebrow">CHÀO MỪNG ĐẾN SÂN NHÀ</p>
          <h2>{register ? 'Tạo tài khoản mới' : 'Vui được gặp lại bạn'}</h2>
          <p>
            {register
              ? 'Bắt đầu với tài khoản khách hàng của bạn.'
              : 'Đăng nhập để tiếp tục với lịch đặt của bạn.'}
          </p>
          <Notice>{error}</Notice>
          <form onSubmit={submit} className="form-stack">
            {register && (
              <Field label="Họ và tên">
                <input
                  className="input"
                  name="full_name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="Nguyễn Văn An"
                />
              </Field>
            )}
            <Field label="Email">
              <input
                className="input"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="ban@example.com"
              />
            </Field>
            {register && (
              <Field label="Số điện thoại (tùy chọn)">
                <input
                  className="input"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  pattern="[0-9+ ().-]{8,20}"
                  placeholder="09xx xxx xxx"
                />
              </Field>
            )}
            <Field label="Mật khẩu" hint={register ? 'Tối thiểu 8 ký tự.' : undefined}>
              <input
                className="input"
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={8}
                maxLength={72}
                required
                placeholder="Nhập mật khẩu"
              />
            </Field>
            <button disabled={busy} className="button button--primary button--wide">
              {busy ? 'Đang xử lý…' : register ? 'Tạo tài khoản' : 'Đăng nhập'}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-card__switch">
            {register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'Đăng nhập' : 'Đăng ký ngay'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
