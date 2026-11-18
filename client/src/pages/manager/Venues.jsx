import { useEffect, useState } from 'react';
import { Plus, Pencil, MapPin, ShieldCheck } from 'lucide-react';
import { post, patch } from '../../api/client';
import {
  useResource,
  PageHeader,
  Loading,
  Notice,
  Empty,
  Field,
  Modal,
  StatusBadge,
  SPORTS,
  money,
  errorMessage,
} from '../../components/shared';
function VenueForm({ venue, onClose, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget));
    v.payment_hold_minutes = Number(v.payment_hold_minutes);
    v.minimum_online_booking_lead_minutes = Number(v.minimum_online_booking_lead_minutes);
    setBusy(true);
    try {
      venue
        ? await patch(`/venues/${venue.id}`, { ...v, expected_version: venue.version })
        : await post('/venues', v);
      onDone(venue ? 'Đã cập nhật thông tin cơ sở.' : 'Đã thêm cơ sở mới.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={venue ? 'Chỉnh sửa thông tin cơ sở' : 'Thêm cơ sở'} onClose={onClose}>
      <Notice>{error}</Notice>
      <form className="form-stack" onSubmit={submit}>
        <Field label="Tên cơ sở">
          <input
            className="input"
            name="name"
            required
            minLength={2}
            maxLength={150}
            defaultValue={venue?.name}
          />
        </Field>
        <Field label="Địa chỉ">
          <input
            className="input"
            name="address"
            required
            maxLength={255}
            defaultValue={venue?.address}
          />
        </Field>
        <Field label="Quận / huyện">
          <input
            className="input"
            name="district"
            required
            maxLength={100}
            defaultValue={venue?.district}
          />
        </Field>
        <Field label="Mô tả">
          <textarea
            className="input"
            name="description"
            maxLength={2000}
            defaultValue={venue?.description || ''}
          />
        </Field>
        <div className="form-grid">
          <Field label="Thời gian giữ chỗ" hint="Số nguyên 1–10 phút, tối đa 10 phút.">
            <input
              className="input"
              name="payment_hold_minutes"
              type="number"
              required
              min="1"
              max="10"
              step="1"
              defaultValue={venue?.payment_hold_minutes || 10}
            />
          </Field>
          <Field label="Đặt online trước (phút)">
            <input
              className="input"
              name="minimum_online_booking_lead_minutes"
              type="number"
              required
              min="10"
              max="1440"
              step="1"
              defaultValue={venue?.minimum_online_booking_lead_minutes || 10}
            />
          </Field>
        </div>
        <Notice type="info">
          Trạng thái vận hành chỉ được quản trị viên thay đổi và có lưu nhật ký.
        </Notice>
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Đóng
          </button>
          <button className="button button--primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu thông tin'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function CourtForm({ court, venue, onClose, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget));
    v.hourly_price = Number(v.hourly_price);
    setBusy(true);
    try {
      court
        ? await patch(`/courts/${court.id}`, { ...v, expected_version: court.version })
        : await post(`/venues/${venue.id}/courts`, v);
      onDone(court ? 'Đã cập nhật thông tin sân.' : 'Đã thêm sân mới.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={court ? 'Chỉnh sửa thông tin sân' : 'Thêm sân'} onClose={onClose}>
      <Notice>{error}</Notice>
      <form className="form-stack" onSubmit={submit}>
        <Field label="Tên sân">
          <input
            className="input"
            name="name"
            required
            minLength={2}
            maxLength={100}
            defaultValue={court?.name}
          />
        </Field>
        <div className="form-grid">
          <Field label="Bộ môn">
            <select
              className="input"
              name="sport_type"
              defaultValue={court?.sport_type || 'FOOTBALL'}
            >
              {Object.entries(SPORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Giá sân / giờ (VND)">
            <input
              className="input"
              type="number"
              name="hourly_price"
              required
              min="0"
              max="100000000"
              step="1000"
              defaultValue={court?.hourly_price || 100000}
            />
          </Field>
        </div>
        <Field label="Mô tả">
          <textarea
            className="input"
            name="description"
            maxLength={2000}
            defaultValue={court?.description || ''}
          />
        </Field>
        <Notice type="info">
          Timetable cố định 06:00 – 22:00, mỗi ca 60 phút. Giá thông tin sân là giá tham khảo. Giá
          từng ca đã nạp và giá đơn đã đặt được giữ nguyên; khi đặt, áp dụng giá hiển thị trên ca.
        </Notice>
        <div className="form-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Đóng
          </button>
          <button className="button button--primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu thông tin'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function ManagerVenuesPage() {
  const venues = useResource('/venues?mine=true');
  const [selected, setSelected] = useState('');
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (venues.data?.length && !selected) setSelected(venues.data[0].id);
  }, [venues.data, selected]);
  const detail = useResource(selected ? `/venues/${selected}` : null);
  function done(msg) {
    setMessage(msg);
    setModal(null);
    venues.reload();
    detail.reload();
  }
  return (
    <>
      <PageHeader
        eyebrow="KHÔNG GIAN QUẢN LÝ"
        title="Cơ sở & sân"
        description="Quản lý thông tin cơ sở thuộc phạm vi phụ trách của bạn."
      >
        <button className="button button--primary" onClick={() => setModal({ type: 'venue' })}>
          <Plus size={17} />
          Thêm cơ sở
        </button>
      </PageHeader>
      <Notice type="success">{message}</Notice>
      <Notice>{venues.error || detail.error}</Notice>
      <div className="venue-switcher">
        {venues.data?.map((v) => (
          <button
            className={`venue-switcher__item ${selected === v.id ? 'active' : ''}`}
            key={v.id}
            onClick={() => setSelected(v.id)}
          >
            <MapPin size={18} />
            <span>
              {v.name}
              <small>{v.district}</small>
            </span>
          </button>
        ))}
      </div>
      {venues.loading || detail.loading ? (
        <Loading />
      ) : detail.data ? (
        <>
          <div className="panel venue-info">
            <div>
              <div className="action-row">
                <h2>{detail.data.name}</h2>
                <StatusBadge status={detail.data.status} />
              </div>
              <p className="muted">
                {detail.data.address} · {detail.data.district}
              </p>
              <div className="chip-row">
                <span className="chip">Giữ chỗ {detail.data.payment_hold_minutes} phút</span>
                <span className="chip">Timetable 06:00 – 22:00</span>
              </div>
            </div>
            <button
              className="button button--secondary"
              onClick={() => setModal({ type: 'venue', item: detail.data })}
            >
              <Pencil size={16} />
              Sửa thông tin
            </button>
          </div>
          <div className="panel">
            <div className="panel__header">
              <h2>
                Danh sách sân <span className="muted">({detail.data.courts?.length || 0})</span>
              </h2>
              <button
                className="button button--secondary button--small"
                onClick={() => setModal({ type: 'court' })}
              >
                <Plus size={16} />
                Thêm sân
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên sân</th>
                    <th>Bộ môn</th>
                    <th>Giá / giờ</th>
                    <th>Trạng thái vận hành</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.courts?.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                        <small>{c.description}</small>
                      </td>
                      <td>{SPORTS[c.sport_type]}</td>
                      <td>{money(c.hourly_price)}</td>
                      <td>
                        <StatusBadge status={c.status} />
                      </td>
                      <td>
                        <button
                          className="button button--ghost button--small"
                          onClick={() => setModal({ type: 'court', item: c })}
                        >
                          <Pencil size={15} />
                          Chỉnh sửa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!detail.data.courts?.length && <Empty>Chưa có sân trong cơ sở này.</Empty>}
            </div>
          </div>
          <Notice type="info">
            <ShieldCheck size={16} /> Trạng thái vận hành được bảo vệ. Liên hệ quản trị viên khi cần
            bảo trì hoặc ngưng phục vụ sân.
          </Notice>
        </>
      ) : (
        !venues.error && <Empty>Chưa có cơ sở được phân công cho tài khoản này.</Empty>
      )}
      {modal?.type === 'venue' && (
        <VenueForm venue={modal.item} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal?.type === 'court' && (
        <CourtForm
          court={modal.item}
          venue={detail.data}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
    </>
  );
}
