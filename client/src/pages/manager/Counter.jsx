import { useState } from 'react';
import { PageHeader, Field, Notice, StatusBadge, SlotLegend, money, timeVN, todayVN } from '../../components/shared';
import { useWorkflowResource, useServerNow } from '../../hooks/useWorkflowResource.js';
import { operations } from '../../services/operations.js';
import { pagePath } from '../../services/customer.js';
import { WorkflowResource, Pagination } from '../../components/workflows/ResourceState';
import { WalkInModal, ExtendModal, CompleteModal } from '../../components/workflows/CounterModals';
import BookingTable from '../../components/workflows/BookingTable';
import BookingFilters from '../../components/workflows/BookingFilters';
import BookingDetail from '../../components/customer/BookingDetail';
import { walkInReason, slotPhase, canComplete } from '../../utils/operations.js';
import '../../styles/operations.css';
export default function CounterPage() {
  const venues = useWorkflowResource('/venues#counter', {
    load: operations.venues
  });
  const [selectedVenue, setVenue] = useState(''),
    [selectedCourt, setCourt] = useState(''),
    [date, setDate] = useState(todayVN());
  const [filters, setFilters] = useState({}),
    [offset, setOffset] = useState(0),
    [modal, setModal] = useState(null),
    [message, setMessage] = useState('');
  const venueId = selectedVenue || venues.data?.[0]?.id,
    venue = venues.data?.find(v => v.id === venueId);
  const courts = useWorkflowResource(venueId ? '/venues/' + venueId + '/courts#counter' : null, {
    load: o => operations.courts(venueId, o)
  });
  const courtId = courts.data?.some(c => c.id === selectedCourt) ? selectedCourt : courts.data?.[0]?.id,
    court = courts.data?.find(c => c.id === courtId);
  const slots = useWorkflowResource(courtId && date ? '/courts/' + courtId + '/slots?date=' + date : null);
  const bookings = useWorkflowResource(venueId ? pagePath('/bookings', {
    ...filters,
    venue_id: venueId
  }, offset) : null);
  const now = useServerNow(slots.offset ?? bookings.offset);
  function reload() {
    slots.reload();
    bookings.reload();
    courts.reload();
    venues.reload();
  }
  function done() {
    setModal(null);
    setMessage('Đã xử lý thành công và tải lại lịch, booking.');
    reload();
  }
  return <div className="workflow-page">
    <PageHeader eyebrow="BÁN SÂN & THU TIỀN TẠI QUẦY" title="Quầy thu ngân" description="Bán ca trống, gia hạn ca liền kề và hoàn thành đơn theo giờ hệ thống." />
    <Notice type="success">{message}</Notice>
    <div className="panel">
      <div className="panel__header">
        <h2>Lịch bán sân</h2>
        <div className="workflow-filters">
          <Field label="Cơ sở">
            <select className="input" value={venueId || ''} onChange={e => {
              setVenue(e.target.value);
              setCourt('');
              setFilters({});
              setOffset(0);
            }}>{venues.data?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          </Field>
          <Field label="Sân">
            <select className="input" value={courtId || ''} onChange={e => setCourt(e.target.value)}>{courts.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </Field>
          <Field label="Ngày">
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="panel__body">
        <WorkflowResource resource={venues}>
          <WorkflowResource resource={courts}>
            <SlotLegend />
            <WorkflowResource resource={slots} empty="Chưa có lịch trong ngày này.">
              <div className="slot-grid">{slots.data?.map(s => <button key={s.id} className={'slot-card slot-card--' + s.status} disabled={!!walkInReason(s, court, venue, now)} title={walkInReason(s, court, venue, now)} onClick={() => setModal({
                  type: 'walk',
                  slot: s
                })}>
                  <strong>{timeVN(s.start_at)} · {timeVN(s.end_at)}</strong>
                  <span>{money(s.price)}</span>
                  <StatusBadge status={s.status} />
                  <small>{slotPhase(s, now)}</small>
                </button>)}</div>
            </WorkflowResource>
          </WorkflowResource>
        </WorkflowResource>
      </div>
    </div>
    <section className="panel">
      <div className="panel__header">
        <h2>Đơn đặt sân tại cơ sở</h2>
        <button className="button button--secondary" onClick={reload}>Tải lại</button>
      </div>
      <div className="panel__body">
        <BookingFilters courts={courts.data} filters={filters} onChange={f => {
          setFilters(f);
          setOffset(0);
        }} />
        <WorkflowResource resource={bookings} empty="Chưa có đơn phù hợp.">
          <BookingTable rows={bookings.data} actions={b => <><button className="button button--secondary" onClick={() => setModal({
              type: 'detail',
              id: b.id
            })}>Chi tiết</button><button className="button button--secondary" disabled={b.status !== 'CONFIRMED' || !!b.issue_reported_at} onClick={() => setModal({
              type: 'extend',
              booking: b
            })}>Gia hạn</button><button className="button button--primary" disabled={!canComplete(b, now)} onClick={() => setModal({
              type: 'complete',
              booking: b
            })}>Hoàn thành</button></>} />
        </WorkflowResource>
        <Pagination offset={offset} count={bookings.data?.length || 0} loading={bookings.loading} onChange={setOffset} />
      </div>
    </section>
    {modal?.type === 'walk' && <WalkInModal slot={modal.slot} court={court} venue={venue} now={now} onClose={() => setModal(null)} onDone={done} onReload={reload} />}
    {modal?.type === 'extend' && <ExtendModal booking={modal.booking} onClose={() => setModal(null)} onDone={done} onReload={reload} />}
    {modal?.type === 'complete' && <CompleteModal booking={modal.booking} now={now} onClose={() => setModal(null)} onDone={done} />}
    {modal?.type === 'detail' && <BookingDetail key={modal.id} id={modal.id} onClose={() => setModal(null)} onRelated={id => setModal({
      type: 'detail',
      id
    })} />}
  </div>;
}
