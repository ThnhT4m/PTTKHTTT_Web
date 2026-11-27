import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { VenueCard, Notice, Empty, SPORTS, PageHeader, money, StatusBadge } from '../../components/shared';
import { useCustomerResource, useDebounced } from '../../hooks/useCustomerResource.js';
import { customer, pagePath } from '../../services/customer.js';
import { priceRangeError } from '../../utils/customer.js';
import { CustomerResource, Pagination } from '../../components/customer/ResourceState';
import CatalogFilters from '../../components/customer/CatalogFilters';
import VenueHero from '../../components/customer/VenueHero';
import '../../styles/customer.css';

function useCatalogQuery(searchable) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(['q', 'district', 'sport_type', 'min_price', 'max_price'].map((key) => [key, params.get(key) || '']));
  const [draft, setDraft] = useState(values.q), debounced = useDebounced(draft);
  useEffect(() => { setDraft(values.q); }, [values.q]);
  const offset = /^\d+$/.test(params.get('offset') || '') ? Math.min(1000000, Number(params.get('offset'))) : 0;
  function change(key, value) {
    setParams((old) => { const next = new URLSearchParams(old); value === '' ? next.delete(key) : next.set(key, value); if (key !== 'offset') next.delete('offset'); return next; });
  }
  useEffect(() => { if (searchable && debounced !== values.q) change('q', debounced); }, [debounced]);
  function clear() { setDraft(''); setParams({}); }
  return { values, draft, setDraft, offset, change, clear };
}
export function VenuesPage() {
  const filters = useCatalogQuery(true), location = useLocation();
  const error = priceRangeError(filters.values.min_price, filters.values.max_price);
  const resource = useCustomerResource(error ? null : pagePath('/venues', filters.values, filters.offset));
  const locations = useCustomerResource('/venues#district-options', { load: customer.districts });
  const districts = [...new Set((locations.data || []).filter((v) => v.status === 'ACTIVE').map((v) => v.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const visible = (resource.data || []).filter((v) => v.status === 'ACTIVE');
  return <>
    <VenueHero />
    <div className="section-title"><div><p className="page-header__eyebrow">KHÁM PHÁ & KẾT NỐI</p><h2>Chọn sân cho trận tiếp theo</h2></div><span className="muted">{resource.loading ? 'Đang tải…' : `${visible.length} cơ sở trên trang này`}</span></div>
    <CatalogFilters values={filters.values} search={filters.draft} onSearch={filters.setDraft} districts={districts} onChange={filters.change} onClear={filters.clear} />
    <Notice>{error}</Notice>
    {locations.error && <><Notice>Chưa tải được lựa chọn địa điểm. Bạn vẫn có thể tìm theo tên hoặc địa chỉ.</Notice><button className="button button--secondary" onClick={locations.reload}>Tải lại địa điểm</button></>}
    {!error && <CustomerResource resource={resource} empty="Chưa tìm thấy cơ sở phù hợp. Hãy thử bộ lọc khác."><div className="venue-grid">{visible.map((v) => <VenueCard key={v.id} venue={v} from={location.pathname + location.search} />)}</div>{!visible.length && <Empty>Trang này chưa có cơ sở đang phục vụ.</Empty>}</CustomerResource>}
    {!error && <Pagination offset={filters.offset} count={resource.data?.length || 0} loading={resource.loading} onChange={(value) => filters.change('offset', value)} />}
    <div className="bottom-callout"><span className="chip">ĐẶT CHỖ DỄ DÀNG</span><h3>Chọn sân. Chọn giờ. Ra sân thôi.</h3><p>Mỗi lượt giữ chỗ có thời hạn do máy chủ xác định.</p></div>
  </>;
}
export function VenueDetailPage() {
  const { id } = useParams(), location = useLocation(), filters = useCatalogQuery(false);
  const venue = useCustomerResource(`/venues/${id}`);
  const { sport_type, min_price, max_price } = filters.values;
  const error = priceRangeError(min_price, max_price);
  const courts = useCustomerResource(error ? null : pagePath(`/venues/${id}/courts`, { sport_type, min_price, max_price }, filters.offset));
  const back = location.state?.catalog?.startsWith('/venues') ? location.state.catalog : '/venues';
  return <>
    <Link className="text-link" to={back}>← Tất cả cơ sở</Link>
    <CustomerResource resource={venue}>
      {venue.data && <>
        <PageHeader eyebrow="ĐỊA ĐIỂM CHO TRẬN ĐẤU CỦA BẠN" title={venue.data.name} description={`${venue.data.address || ''} · ${venue.data.district || ''}`}><StatusBadge status={venue.data.status} /></PageHeader>
        {venue.data.status !== 'ACTIVE' ? <Notice>Cơ sở đã tạm ngừng phục vụ. Vui lòng quay lại danh sách để chọn cơ sở khác.</Notice> : <div className="panel-grid">
          <section className="panel"><div className="panel__header"><h2>Danh sách sân đang phục vụ</h2></div><div className="panel__body"><CatalogFilters values={{ sport_type, min_price, max_price }} onChange={filters.change} onClear={filters.clear} /><Notice>{error}</Notice><p className="muted">Giá dưới đây là giá tham khảo. Giá thực tế được hiển thị trên từng ca.</p></div>
            {!error && <CustomerResource resource={courts} empty="Chưa có sân đang phục vụ phù hợp với bộ lọc."><div className="court-list">{courts.data?.filter((c) => c.status === 'ACTIVE').map((c) => <article className="court-row" key={c.id}>
              <div className={`sport-icon sport-icon--${c.sport_type}`}><CalendarDays size={24} /></div><div className="court-row__info"><small>{SPORTS[c.sport_type] || c.sport_type}</small><h3>{c.name}</h3>{c.description && <p>{c.description}</p>}<StatusBadge status={c.status} /></div><div className="court-row__action"><strong>{money(c.hourly_price)}<small> / giờ tham khảo</small></strong><Link className="button button--primary button--small" to={`/courts/${c.id}/schedule`}>Xem lịch <ArrowRight size={16} /></Link></div>
            </article>)}</div></CustomerResource>}
            {!error && <Pagination offset={filters.offset} count={courts.data?.length || 0} loading={courts.loading} onChange={(value) => filters.change('offset', value)} />}
          </section>
          <aside className="panel"><div className="panel__body"><h2>Thông tin cơ sở</h2>{venue.data.description && <p>{venue.data.description}</p>}<dl className="summary-list"><div className="summary-list__row"><dt>Khung giờ</dt><dd>06:00 – 22:00</dd></div><div className="summary-list__row"><dt>Thời gian giữ chỗ</dt><dd>{venue.data.payment_hold_minutes} phút</dd></div><div className="summary-list__row"><dt>Đặt online trước</dt><dd>Ít nhất {venue.data.minimum_online_booking_lead_minutes} phút</dd></div></dl></div></aside>
        </div>}
      </>}
    </CustomerResource>
  </>;
}
