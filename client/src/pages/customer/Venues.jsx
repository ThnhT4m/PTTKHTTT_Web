import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, MapPin, Search, SlidersHorizontal, CalendarDays } from 'lucide-react';
import { query } from '../../api/client';
import {
  useResource,
  VenueCard,
  Loading,
  Notice,
  Empty,
  SPORTS,
  PageHeader,
  money,
  StatusBadge,
} from '../../components/shared';
export function VenuesPage() {
  const [filters, setFilters] = useState({ q: '', district: '', sport_type: '', max_price: '' });
  const { data, loading, error, reload } = useResource(`/venues?${query(filters)}`);
  return (
    <>
      <section className="hero">
        <div className="hero__content">
          <span className="hero__eyebrow">
            <span />
            SÂN SẴN SÀNG. BẠN THÌ SAO?
          </span>
          <h1 className="hero__title">
            Tìm sân đúng ý.
            <br />
            <em>Chơi hết mình.</em>
          </h1>
          <p className="hero__description">
            Từ một trận cầu sau giờ làm đến cuối tuần cùng đồng đội. Chọn sân và khung giờ phù hợp
            với bạn.
          </p>
          <div className="hero__pill">
            <MapPin size={16} /> Khám phá các sân tại TP. Hồ Chí Minh
          </div>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="hero__orbit" />
          <div className="court-art court-art--hero">
            <span className="court-art__circle" />
            <span className="court-art__net" />
          </div>
          <div className="hero__float">
            <CalendarDays size={22} />
            <span>
              Hẹn nhau trên sân<strong>06:00 – 22:00 mỗi ngày</strong>
            </span>
          </div>
          <span className="hero__ball">✦</span>
        </div>
      </section>
      <div className="stat-strip">
        <div className="stat-strip__item">
          <strong>05</strong>
          <span>Bộ môn thể thao</span>
        </div>
        <div className="stat-strip__item">
          <strong>60′</strong>
          <span>Mỗi khung giờ thi đấu</span>
        </div>
        <div className="stat-strip__item">
          <strong>01</strong>
          <span>Nơi cho mọi cuộc hẹn</span>
        </div>
      </div>
      <div className="section-title">
        <div>
          <p className="page-header__eyebrow">KHÁM PHÁ & KẾT NỐI</p>
          <h2>Chọn sân cho trận tiếp theo</h2>
        </div>
        <span className="muted">{data?.length ?? '—'} cơ sở phù hợp</span>
      </div>
      <form className="filter-bar" onSubmit={(e) => e.preventDefault()}>
        <label className="filter-bar__field">
          <Search size={18} />
          <input
            aria-label="Tìm cơ sở"
            placeholder="Tên cơ sở, địa chỉ…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
        </label>
        <label className="filter-bar__field">
          <MapPin size={17} />
          <input
            aria-label="Quận huyện"
            placeholder="Quận / huyện"
            value={filters.district}
            onChange={(e) => setFilters((f) => ({ ...f, district: e.target.value }))}
          />
        </label>
        <select
          aria-label="Bộ môn"
          value={filters.sport_type}
          onChange={(e) => setFilters((f) => ({ ...f, sport_type: e.target.value }))}
        >
          <option value="">Tất cả bộ môn</option>
          {Object.entries(SPORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Giá tối đa mỗi giờ"
          value={filters.max_price}
          onChange={(e) => setFilters((f) => ({ ...f, max_price: e.target.value }))}
        >
          <option value="">Tất cả mức giá</option>
          <option value="150000">Dưới 150.000đ</option>
          <option value="300000">Dưới 300.000đ</option>
          <option value="500000">Dưới 500.000đ</option>
        </select>
        <button
          type="button"
          className="icon-button"
          aria-label="Xóa bộ lọc"
          title="Xóa bộ lọc"
          onClick={() => setFilters({ q: '', district: '', sport_type: '', max_price: '' })}
        >
          <SlidersHorizontal size={19} />
        </button>
      </form>
      <Notice>{error}</Notice>
      {error && (
        <button className="button button--secondary" onClick={reload}>
          Thử lại
        </button>
      )}
      {loading ? (
        <Loading />
      ) : data?.length ? (
        <div className="venue-grid">
          {data.map((v) => (
            <VenueCard key={v.id} venue={v} />
          ))}
        </div>
      ) : (
        !error && <Empty>Chưa tìm thấy cơ sở phù hợp. Hãy thử bộ lọc khác.</Empty>
      )}
      <div className="bottom-callout">
        <span className="chip">ĐẶT CHỖ DỄ DÀNG</span>
        <h3>Chọn sân. Chọn giờ. Ra sân thôi.</h3>
        <p>Mỗi lượt giữ chỗ có thời hạn riêng. Hoàn tất thanh toán để xác nhận lịch của bạn.</p>
      </div>
    </>
  );
}
export function VenueDetailPage() {
  const { id } = useParams();
  const { data: venue, loading, error } = useResource(`/venues/${id}`);
  if (loading) return <Loading />;
  if (!venue) return <Notice>{error}</Notice>;
  return (
    <>
      <Link className="text-link" to="/venues">
        ← Tất cả cơ sở
      </Link>
      <PageHeader
        eyebrow="ĐỊA ĐIỂM CHO TRẬN ĐẤU CỦA BẠN"
        title={venue.name}
        description={`${venue.address} · ${venue.district}`}
      >
        <StatusBadge status={venue.status} />
      </PageHeader>
      <div className="panel-grid">
        <div className="panel">
          <div className="panel__header">
            <h2>Danh sách sân</h2>
            <span className="chip">{venue.courts?.length || 0} sân</span>
          </div>
          <div className="court-list">
            {venue.courts?.length ? (
              venue.courts.map((c) => (
                <article className="court-row" key={c.id}>
                  <div className={`sport-icon sport-icon--${c.sport_type}`}>
                    <CalendarDays size={24} />
                  </div>
                  <div className="court-row__info">
                    <small>{SPORTS[c.sport_type]}</small>
                    <h3>{c.name}</h3>
                    <p>{c.description || 'Timetable cố định 06:00 – 22:00, mỗi ca 60 phút.'}</p>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="court-row__action">
                    <strong>
                      {money(c.hourly_price)}
                      <small> / giờ</small>
                    </strong>
                    {c.status === 'ACTIVE' && venue.status === 'ACTIVE' ? (
                      <Link
                        className="button button--primary button--small"
                        to={`/courts/${c.id}/schedule`}
                      >
                        Xem lịch <ArrowRight size={16} />
                      </Link>
                    ) : (
                      <span className="muted">Tạm ngưng đặt sân</span>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <Empty>Cơ sở chưa có sân.</Empty>
            )}
          </div>
        </div>
        <aside className="panel">
          <div className="panel__body">
            <h2>Thông tin cơ sở</h2>
            <p className="muted">
              {venue.description || 'Chào đón bạn và đồng đội đến tập luyện, thi đấu.'}
            </p>
            <dl className="summary-list">
              <div className="summary-list__row">
                <dt>Khung giờ</dt>
                <dd>06:00 – 22:00</dd>
              </div>
              <div className="summary-list__row">
                <dt>Thời gian giữ chỗ</dt>
                <dd>{venue.payment_hold_minutes} phút</dd>
              </div>
              <div className="summary-list__row">
                <dt>Đặt online trước</dt>
                <dd>Ít nhất {venue.minimum_online_booking_lead_minutes} phút</dd>
              </div>
            </dl>
            <Notice type="info">
              Chọn một sân để xem lịch trống theo ngày. Giá cụ thể được hiển thị ở mỗi khung giờ.
            </Notice>
          </div>
        </aside>
      </div>
    </>
  );
}
