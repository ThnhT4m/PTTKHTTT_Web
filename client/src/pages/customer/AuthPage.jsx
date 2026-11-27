import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CircleDot, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Brand } from '../../layouts/Layouts';
import { Field, Notice } from '../../components/shared';
import { authErrors } from '../../utils/validation.js';
import { customerReturnPath, fieldErrors } from '../../utils/customer.js';
import '../../styles/customer.css';
export default function AuthPage({ register = false }) {
  const { user, login, register: signUp, authNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({}), [visible, setVisible] = useState(false);
  const locked = useRef(false);
  useEffect(() => { setError(''); setErrors({}); setVisible(false); }, [register]);
  if (user) return <Navigate to={customerReturnPath(location.state?.from, user.role)} replace />;
  async function submit(e) {
    e.preventDefault();
    if (locked.current) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const validation = authErrors(values, register);
    if (register && values.password_confirmation !== values.password) validation.password_confirmation = 'Mật khẩu xác nhận chưa khớp.';
    setErrors(validation); setError('');
    if (Object.keys(validation).length) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const logged = await (register ? signUp(values) : login(values));
      navigate(
        customerReturnPath(location.state?.from, logged.role),
        { replace: true },
      );
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
    } finally {
      locked.current = false;
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
          <Notice type="info">{authNotice}</Notice>
          <form onSubmit={submit} className="form-stack" noValidate>
            <fieldset className="customer-form" disabled={busy}>
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
                  aria-invalid={!!errors.full_name}
                />
                {errors.full_name && <span className="customer-field-error">{errors.full_name}</span>}
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
                aria-invalid={!!errors.email}
              />
              {errors.email && <span className="customer-field-error">{errors.email}</span>}
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
                  aria-invalid={!!errors.phone}
                />
                {errors.phone && <span className="customer-field-error">{errors.phone}</span>}
              </Field>
            )}
            <Field label="Mật khẩu" hint="Ít nhất 8 ký tự, tối đa 72 byte UTF-8.">
              <span className="customer-password"><input
                className="input"
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={8}
                maxLength={72}
                required
                placeholder="Nhập mật khẩu"
                aria-invalid={!!errors.password}
              /><button className="icon-button" type="button" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} onClick={() => setVisible((v) => !v)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></span>
              {errors.password && <span className="customer-field-error">{errors.password}</span>}
            </Field>
            {register && <Field label="Xác nhận mật khẩu"><input className="input" name="password_confirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" required aria-invalid={!!errors.password_confirmation} />{errors.password_confirmation && <span className="customer-field-error">{errors.password_confirmation}</span>}</Field>}
            <button disabled={busy} className="button button--primary button--wide">
              {busy ? 'Đang xử lý…' : register ? 'Tạo tài khoản' : 'Đăng nhập'}
              <ArrowRight size={18} />
            </button>
            </fieldset>
          </form>
          <p className="auth-card__switch">
            {register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
            <Link to={register ? '/login' : '/register'} state={location.state}>
              {register ? 'Đăng nhập' : 'Đăng ký ngay'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
