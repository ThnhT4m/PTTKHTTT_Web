import { Field, SPORTS } from '../shared';
export default function CatalogFilters({ values, onChange, search, onSearch, districts, onClear }) {
  return <form className="customer-filters" onSubmit={(event) => event.preventDefault()}>
    {onSearch && <Field label="Tên cơ sở hoặc địa chỉ"><input className="input" aria-label="Tìm cơ sở" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Tìm sân phù hợp…" /></Field>}
    {districts && <Field label="Quận / huyện"><select className="input" aria-label="Quận huyện" value={values.district || ''} onChange={(e) => onChange('district', e.target.value)}><option value="">Tất cả địa điểm</option>{districts.map((district) => <option key={district} value={district}>{district}</option>)}</select></Field>}
    <Field label="Bộ môn"><select className="input" aria-label="Bộ môn" value={values.sport_type || ''} onChange={(e) => onChange('sport_type', e.target.value)}><option value="">Tất cả bộ môn</option>{Object.entries(SPORTS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field>
    <Field label="Giá tối thiểu (VND)"><input className="input" type="number" aria-label="Giá tối thiểu" min={0} step={1} value={values.min_price || ''} onChange={(e) => onChange('min_price', e.target.value)} /></Field>
    <Field label="Giá tối đa (VND)"><input className="input" type="number" aria-label="Giá tối đa" min={0} step={1} value={values.max_price || ''} onChange={(e) => onChange('max_price', e.target.value)} /></Field>
    <button type="button" className="button button--secondary" aria-label="Xóa bộ lọc" onClick={onClear}>Xóa bộ lọc</button>
  </form>;
}
