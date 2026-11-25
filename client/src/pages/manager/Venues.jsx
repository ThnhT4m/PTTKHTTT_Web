import { useEffect, useState } from 'react';
import { Plus, MapPin, RefreshCw, CalendarDays } from 'lucide-react';
import { PageHeader, Notice, StatusBadge, Field } from '../../components/shared';
import { manager } from '../../services/manager.js';
import { useManagerResource } from '../../hooks/useManagerResource.js';
import { ResourceState } from '../../components/manager/ResourceState';
import EntityForm from '../../components/manager/EntityForm';
import OperationModal from '../../components/manager/OperationModal';
import GenerateModal from '../../components/manager/GenerateModal';
import CourtList from '../../components/manager/CourtList';
import ManagerSchedule from '../../components/manager/ManagerSchedule';
import '../../styles/manager.css';

export default function ManagerVenuesPage() {
  const venues = useManagerResource(manager.venues, []);
  const [selected, setSelected] = useState(''), [tab, setTab] = useState('courts');
  const [modal, setModal] = useState(null), [message, setMessage] = useState('');
  const [courtId, setCourtId] = useState(''), [scheduleRevision, setScheduleRevision] = useState(0);
  const detail = useManagerResource((options) => selected ? manager.venue(selected, options) : null, [selected]);
  const courts = useManagerResource((options) => selected ? manager.courts(selected, options) : null, [selected]);
  useEffect(() => {
    if (venues.data) setSelected((current) => venues.data.some((v) => v.id === current) ? current : venues.data[0]?.id || '');
  }, [venues.data]);
  useEffect(() => {
    if (courts.data) setCourtId((current) => courts.data.some((c) => c.id === current) ? current : courts.data[0]?.id || '');
  }, [courts.data]);
  function reload() { venues.reload(); detail.reload(); courts.reload(); setScheduleRevision((n) => n + 1); }
  function done(text, item) {
    const creatingVenue = modal?.kind === 'entity' && modal.type === 'venues' && !modal.item;
    setMessage(text); setModal(null);
    if (creatingVenue && item) { setSelected(item.id); setCourtId(''); setTab('info'); }
    reload();
  }
  function reloadConflict() {
    setModal(null); setMessage('Đang tải dữ liệu mới. Kiểm tra lại thông tin rồi mở lại thao tác để xác nhận.'); reload();
  }
  function openEntity(type, item) { setMessage(''); setModal({ kind: 'entity', type, item }); }
  function openOperation(type, item, remove = false) { setMessage(''); setModal({ kind: 'operation', type, item, remove }); }
  const venue = detail.data;
  const canGenerate = venue?.status === 'ACTIVE' && courts.data?.some((c) => c.status === 'ACTIVE');
  return <>
    <PageHeader eyebrow="KHÔNG GIAN QUẢN LÝ" title="Cơ sở & sân" description="Quản lý cơ sở, sân và khung giờ trong phạm vi phụ trách.">
      <div className="action-row"><button className="button button--secondary" onClick={reload}><RefreshCw size={16} />Tải lại</button><button className="button button--primary" onClick={() => openEntity('venues')}><Plus size={17} />Thêm cơ sở</button></div>
    </PageHeader>
    <Notice type="success">{message}</Notice>
    <ResourceState resource={venues} empty="Chưa có cơ sở. Chọn Thêm cơ sở để bắt đầu.">
      <div className="venue-switcher" aria-label="Cơ sở quản lý">{venues.data?.map((v) => <button className={`venue-switcher__item ${selected === v.id ? 'active' : ''}`} key={v.id} aria-pressed={selected === v.id} onClick={() => { setSelected(v.id); setCourtId(''); setMessage(''); }}>
        <MapPin size={18} /><span>{v.name}<small>{v.district} · {v.status === 'ACTIVE' ? 'Hoạt động' : v.status === 'INACTIVE' ? 'Ngừng hoạt động' : 'Bảo trì'}</small></span>
      </button>)}</div>
      <ResourceState resource={detail} empty="Chọn một cơ sở để xem thông tin.">
        {venue && <>
          <div className="panel venue-info"><div><div className="action-row"><h2>{venue.name}</h2><StatusBadge status={venue.status} /></div><p className="muted">{venue.address} · {venue.district}</p><div className="chip-row"><span className="chip">Giữ chỗ {venue.payment_hold_minutes} phút</span><span className="chip">06:00 – 22:00 · 60 phút/ca</span></div></div><button className="button button--secondary" disabled={!canGenerate || courts.loading} onClick={() => setModal({ kind: 'generate' })}><CalendarDays size={17} />Sinh lịch sân</button></div>
          <div className="tabs" role="tablist" aria-label="Nhóm quản lý">{[['info', 'Thông tin cơ sở'], ['courts', 'Danh sách sân'], ['schedule', 'Lịch và giá sân']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
          {tab === 'info' && <section className="panel" aria-label="Thông tin cơ sở"><div className="panel__header"><h2>Thông tin cơ sở</h2><button className="button button--secondary" onClick={() => openEntity('venues', venue)}>Sửa thông tin</button></div><div className="panel__body">
            <p>{venue.description || 'Chưa có mô tả.'}</p><dl className="summary-list"><div className="summary-list__row"><dt>Thời gian giữ chỗ</dt><dd>{venue.payment_hold_minutes} phút</dd></div><div className="summary-list__row"><dt>Đặt online trước giờ bắt đầu</dt><dd>{venue.minimum_online_booking_lead_minutes} phút</dd></div><div className="summary-list__row"><dt>Trạng thái</dt><dd><StatusBadge status={venue.status} /></dd></div></dl>
            <div className="action-row"><button className="button button--secondary" onClick={() => openOperation('venues', venue)}>Đổi trạng thái cơ sở</button><button className="button button--danger" onClick={() => openOperation('venues', venue, true)}>Xóa mềm cơ sở</button></div>
            <Notice type="info">Cơ sở ngừng hoạt động vẫn hiển thị ở trang quản lý. Có thể kích hoạt lại khi phù hợp. Trước khi ngưng hoạt động, cần xử lý các đơn hiệu lực chưa kết thúc.</Notice>
          </div></section>}
          {tab === 'courts' && <section className="panel" aria-label="Danh sách sân"><div className="panel__header"><h2>Danh sách sân <span className="muted">({courts.data?.length ?? '—'})</span></h2><button className="button button--secondary button--small" onClick={() => openEntity('courts')}><Plus size={16} />Thêm sân</button></div>
            <ResourceState resource={courts} empty="Cơ sở chưa có sân. Chọn Thêm sân để bắt đầu."><CourtList key={selected} courts={courts.data || []} onEdit={(c) => openEntity('courts', c)} onStatus={(c) => openOperation('courts', c)} onRemove={(c) => openOperation('courts', c, true)} onSchedule={(c) => { setCourtId(c.id); setTab('schedule'); }} /></ResourceState>
            <div className="panel__body"><Notice type="info">Giá mặc định chỉ áp dụng cho ca sinh mới. Giá ca đã tồn tại và giá booking đã tạo không bị ghi đè.</Notice></div>
          </section>}
          {tab === 'schedule' && <ResourceState resource={courts} empty="Cơ sở chưa có sân để xem lịch."><ManagerSchedule key={selected} courts={courts.data || []} courtId={courtId} setCourtId={setCourtId} revision={scheduleRevision} venueActive={venue.status === 'ACTIVE'} onGenerate={() => setModal({ kind: 'generate' })} /></ResourceState>}
          {tab !== 'courts' && courts.error && <Notice>{courts.error.message}</Notice>}
        </>}
      </ResourceState>
    </ResourceState>
    {modal?.kind === 'entity' && <EntityForm key={`${modal.type}/${modal.item?.id || 'new'}/${modal.item?.version || 0}`} type={modal.type} item={modal.item} venueId={selected} onClose={() => setModal(null)} onDone={done} onReload={reloadConflict} />}
    {modal?.kind === 'operation' && <OperationModal type={modal.type} item={modal.item} remove={modal.remove} onClose={() => setModal(null)} onDone={done} onReload={reloadConflict} />}
    {modal?.kind === 'generate' && venue && <GenerateModal venue={venue} courts={courts.data || []} onClose={() => setModal(null)} onReload={reloadConflict} onDone={() => { setMessage('Đã sinh lịch. Kết quả tạo mới/bỏ qua được hiển thị trong biểu mẫu.'); setScheduleRevision((n) => n + 1); }} />}
  </>;
}
