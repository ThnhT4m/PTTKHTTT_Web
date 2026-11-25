import { Field } from '../shared';
export default function BookingFilters({
  filters,
  onChange,
  courts: courtRows,
  issue = false
}) {
  const courts = courtRows || [];
  function field(key, value) {
    onChange({
      ...filters,
      [key]: value
    });
  }
  return <div className="workflow-filters">
    <Field label="Lọc sân">
      <select className="input" value={filters.court_id || ''} onChange={e => field('court_id', e.target.value)}>
        <option value="">Tất cả sân</option>
        {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </Field>
    <Field label="Ngày đặt sân">
      <input className="input" type="date" value={filters.date || ''} onChange={e => field('date', e.target.value)} />
    </Field>
    <Field label="Trạng thái đơn">
      <select className="input" value={filters.status || ''} onChange={e => field('status', e.target.value)}>
        <option value="">Tất cả</option>
        {['PENDING', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELLED_BY_VENUE'].map(s => <option key={s}>{s}</option>)}
      </select>
    </Field>
    <Field label="Nguồn đơn">
      <select className="input" value={filters.source || ''} onChange={e => field('source', e.target.value)}>
        <option value="">Tất cả</option>
        {['ONLINE', 'WALK_IN', 'EXTENSION'].map(s => <option key={s}>{s}</option>)}
      </select>
    </Field>
    {issue && <Field label="Sự cố">
      <select className="input" value={filters.has_issue || ''} onChange={e => field('has_issue', e.target.value)}>
        <option value="">Tất cả</option>
        <option value="true">Có sự cố</option>
        <option value="false">Không có sự cố</option>
      </select>
    </Field>}
  </div>;
}
