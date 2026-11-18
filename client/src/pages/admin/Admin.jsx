import { useEffect, useState } from 'react';
import { Building2, CalendarCheck2, Banknote, Users, ShieldCheck, RefreshCw } from 'lucide-react';
import { patch } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import {
  useResource,
  PageHeader,
  Field,
  Loading,
  Notice,
  Empty,
  Modal,
  StatusBadge,
  SlotGrid,
  todayVN,
  dateVN,
  timeVN,
  money,
  errorMessage,
} from '../../components/shared';
function StatusModal({ target, onClose, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const states =
    target.type === 'slots' ? ['AVAILABLE', 'UNAVAILABLE'] : ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];
  async function submit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      await patch(`/admin/${target.type}/${target.item.id}/status`, {
        ...body,
        expected_version: target.item.version,
      });
      onDone('Đã cập nhật trạng thái và ghi nhật ký.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Đổi trạng thái vận hành" onClose={onClose}>
      <p>
        <strong>
          {target.item.name ||
            `${target.item.start_time?.slice(0, 5)} – ${target.item.end_time?.slice(0, 5)}`}
        </strong>
      </p>
      <Notice>{error}</Notice>
      <form className="form-stack" onSubmit={submit}>
        <Field label="Trạng thái mới">
          <select
            className="input"
            name="status"
            defaultValue={states.includes(target.item.status) ? target.item.status : states[0]}
          >
            {states.map((s) => (
              <option key={s} value={s}>
                {
                  {
                    ACTIVE: 'Hoạt động',
                    INACTIVE: 'Ngừng hoạt động',
                    MAINTENANCE: 'Bảo trì',
                    AVAILABLE: 'Còn trống',
                    UNAVAILABLE: 'Ngưng phục vụ',
                  }[s]
                }
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lý do thay đổi">
          <textarea
            className="input"
            name="reason"
            minLength={5}
            maxLength={1000}
            required
            placeholder="Nêu rõ lý do để lưu trong nhật ký"
          />
        </Field>
        <Notice type="info">
          Sân hoặc cơ sở đang có đơn giữ chỗ / đã xác nhận chưa kết thúc phải được xử lý trước khi
          khóa. Mỗi thay đổi kiểm tra phiên bản dữ liệu để tránh ghi đè.
        </Notice>
        <div className="form-actions">
          <button className="button button--secondary" type="button" onClick={onClose}>
            Đóng
          </button>
          <button className="button button--primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Xác nhận thay đổi'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [venueId, setVenueId] = useState('');
  const [courtId, setCourtId] = useState('');
  const [date, setDate] = useState(todayVN());
  const overview = useResource('/admin/overview');
  const users = useResource('/admin/users');
  const audits = useResource('/admin/audit-logs');
  const venues = useResource('/venues');
  const venue = useResource(venueId ? `/venues/${venueId}` : null);
  const slots = useResource(courtId ? `/courts/${courtId}/slots?date=${date}` : null);
  useEffect(() => {
    if (venues.data?.length && !venueId) setVenueId(venues.data[0].id);
  }, [venues.data, venueId]);
  useEffect(() => {
    if (venue.data?.courts?.length && !venue.data.courts.some((c) => c.id === courtId))
      setCourtId(venue.data.courts[0].id);
    else if (venue.data && !venue.data.courts?.length) setCourtId('');
  }, [venue.data, courtId]);
  function reload() {
    overview.reload();
    users.reload();
    audits.reload();
    venues.reload();
    venue.reload();
    slots.reload();
  }
  function done(msg) {
    setMessage(msg);
    setModal(null);
    reload();
  }
  async function updateUser(u, values) {
    setBusy(true);
    setError('');
    try {
      await patch(`/admin/users/${u.id}/status`, values);
      done('Đã cập nhật tài khoản.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const stats = [
    ['Cơ sở thể thao', overview.data?.total_venues, Building2],
    ['Tổng lượt đặt sân', overview.data?.total_bookings, CalendarCheck2],
    ['Doanh thu toàn hệ thống', money(overview.data?.total_revenue), Banknote],
    ['Tài khoản', overview.data?.total_users, Users],
  ];
  const auditRows = Array.isArray(audits.data)
    ? audits.data
    : audits.data?.items || audits.data?.rows || [];
  return (
    <>
      <PageHeader
        eyebrow="TOÀN BỘ HỆ THỐNG"
        title="Quản trị hệ thống"
        description="Giám sát hoạt động, phân quyền và kiểm soát thay đổi trên toàn bộ cơ sở."
      >
        <button className="button button--secondary" onClick={reload}>
          <RefreshCw size={16} />
          Tải lại
        </button>
      </PageHeader>
      <Notice type="success">{message}</Notice>
      <Notice>
        {error ||
          overview.error ||
          users.error ||
          audits.error ||
          venues.error ||
          venue.error ||
          slots.error}
      </Notice>
      <div className="metric-grid">
        {stats.map(([label, value, Icon]) => (
          <article className="metric-card" key={label}>
            <span className="metric-card__icon">
              <Icon size={22} />
            </span>
            <span>{label}</span>
            <strong>{value ?? '—'}</strong>
          </article>
        ))}
      </div>
      <div className="tabs">
        {[
          ['overview', 'Tài khoản'],
          ['operations', 'Trạng thái sân & cơ sở'],
          ['audit', 'Nhật ký thay đổi'],
        ].map(([v, l]) => (
          <button className={tab === v ? 'active' : ''} key={v} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <div className="panel">
          <div className="panel__header">
            <h2>Quản lý tài khoản</h2>
            <span className="chip">{users.data?.length || 0} tài khoản</span>
          </div>
          {users.loading ? (
            <Loading />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data?.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.full_name}</strong>
                        <small>{u.email}</small>
                      </td>
                      <td>
                        <StatusBadge status={u.role} />
                      </td>
                      <td>
                        <span
                          className={`badge ${u.is_active ? 'badge--ACTIVE' : 'badge--INACTIVE'}`}
                        >
                          {u.is_active ? 'Đang hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      <td>
                        <div className="action-row">
                          <button
                            className={`button button--small ${u.is_active ? 'button--danger' : 'button--secondary'}`}
                            disabled={busy || u.id === user.id}
                            onClick={() => updateUser(u, { is_active: !u.is_active })}
                          >
                            {u.is_active ? 'Khóa' : 'Mở khóa'}
                          </button>
                          {u.role === 'CUSTOMER' && (
                            <button
                              className="button button--secondary button--small"
                              disabled={busy}
                              onClick={() => updateUser(u, { role: 'VENUE_MANAGER' })}
                            >
                              Cấp quyền quản lý
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab === 'operations' && (
        <>
          <Notice type="info">
            <ShieldCheck size={17} /> Chỉ ADMIN thay đổi trực tiếp trạng thái vận hành. Thao tác bắt
            buộc lý do và lưu log trong cùng giao dịch.
          </Notice>
          <div className="panel">
            <div className="panel__header">
              <h2>Cơ sở</h2>
              <Field label="Chọn cơ sở">
                <select
                  className="input"
                  value={venueId}
                  onChange={(e) => setVenueId(e.target.value)}
                >
                  {venues.data?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {venue.loading ? (
              <Loading />
            ) : (
              venue.data && (
                <div className="panel__body">
                  <div className="action-row">
                    <h3>{venue.data.name}</h3>
                    <StatusBadge status={venue.data.status} />
                    <button
                      className="button button--secondary button--small"
                      onClick={() => setModal({ type: 'venues', item: venue.data })}
                    >
                      Đổi trạng thái cơ sở
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Sân</th>
                          <th>Trạng thái</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {venue.data.courts?.map((c) => (
                          <tr key={c.id}>
                            <td>{c.name}</td>
                            <td>
                              <StatusBadge status={c.status} />
                            </td>
                            <td>
                              <button
                                className="button button--secondary button--small"
                                onClick={() => setModal({ type: 'courts', item: c })}
                              >
                                Đổi trạng thái sân
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </div>
          <div className="panel">
            <div className="panel__header">
              <h2>Khóa / mở khung giờ cố định</h2>
              <div className="action-row">
                <Field label="Sân">
                  <select
                    className="input"
                    value={courtId}
                    onChange={(e) => setCourtId(e.target.value)}
                  >
                    {venue.data?.courts?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Ngày">
                  <input
                    className="input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
              </div>
            </div>
            <div className="panel__body">
              <p className="muted">
                Chọn ca còn trống hoặc đang ngưng phục vụ. Ca đã giữ chỗ / đặt phải được xử lý qua
                nghiệp vụ đơn.
              </p>
              {slots.loading ? (
                <Loading />
              ) : slots.data?.length ? (
                <SlotGrid
                  slots={slots.data}
                  admin
                  disabled={busy}
                  onSelect={(s) => {
                    if (['AVAILABLE', 'UNAVAILABLE'].includes(s.status))
                      setModal({ type: 'slots', item: s });
                    else
                      setError(
                        'Khung giờ đang có giao dịch. Hãy xử lý đơn trước khi đổi trạng thái.',
                      );
                  }}
                />
              ) : (
                <Empty>Chưa có khung giờ trong lựa chọn này.</Empty>
              )}
            </div>
          </div>
        </>
      )}
      {tab === 'audit' && (
        <div className="panel">
          <div className="panel__header">
            <h2>Nhật ký thay đổi</h2>
            <span className="muted">Bản ghi mới nhất</span>
          </div>
          {audits.loading ? (
            <Loading />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Thời điểm</th>
                    <th>Người thực hiện</th>
                    <th>Thao tác</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {dateVN(a.created_at)}
                        <small>{timeVN(a.created_at)}</small>
                      </td>
                      <td>{a.actor_name || 'Hệ thống'}</td>
                      <td>
                        <strong>{a.action}</strong>
                        <small>
                          {a.entity_type} · {a.entity_id?.slice(0, 8)}
                        </small>
                      </td>
                      <td>
                        {a.reason && <p>{a.reason}</p>}
                        <details className="audit-details">
                          <summary>Xem dữ liệu thay đổi</summary>
                          <pre>
                            {JSON.stringify({ truoc: a.before_data, sau: a.after_data }, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!auditRows.length && <Empty>Chưa có nhật ký thay đổi.</Empty>}
            </div>
          )}
        </div>
      )}
      {modal && <StatusModal target={modal} onClose={() => setModal(null)} onDone={done} />}
    </>
  );
}
