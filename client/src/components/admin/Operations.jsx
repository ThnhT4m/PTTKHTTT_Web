import { useState } from 'react';
import { Field, StatusBadge, SlotGrid, Notice, todayVN } from '../shared';
import { useWorkflowResource } from '../../hooks/useWorkflowResource.js';
import { admin } from '../../services/admin.js';
import { WorkflowResource } from '../workflows/ResourceState';
import OperationModal from '../manager/OperationModal';
export default function Operations() {
  const venues = useWorkflowResource('/venues#admin-operations', {
    load: admin.venues
  });
  const [selectedVenue, setVenue] = useState(''),
    [selectedCourt, setCourt] = useState(''),
    [date, setDate] = useState(todayVN()),
    [target, setTarget] = useState(null),
    [message, setMessage] = useState('');
  const venueId = selectedVenue || venues.data?.[0]?.id;
  const venue = useWorkflowResource(venueId ? `/venues/${venueId}` : null);
  const courts = useWorkflowResource(venueId ? `/venues/${venueId}/courts#admin` : null, {
    load: o => admin.courts(venueId, o)
  });
  const courtId = courts.data?.some(c => c.id === selectedCourt) ? selectedCourt : courts.data?.[0]?.id;
  const slots = useWorkflowResource(courtId && date ? `/courts/${courtId}/slots?date=${date}` : null);
  function reload() {
    venues.reload();
    venue.reload();
    courts.reload();
    slots.reload();
  }
  return <><Notice type="success">{message}</Notice><section className="panel">
    <div className="panel__header">
      <h2>Trạng thái sân & cơ sở</h2>
      <button className="button button--secondary" onClick={reload}>Tải lại</button>
    </div>
    <div className="panel__body">
      <WorkflowResource resource={venues}>
        <Field label="Chọn cơ sở">
          <select className="input" value={venueId || ''} onChange={e => {
              setVenue(e.target.value);
              setCourt('');
            }}>{venues.data?.map(v => <option key={v.id} value={v.id}>{v.name} · {v.status}</option>)}</select>
        </Field>
      </WorkflowResource>
      <WorkflowResource resource={venue}>{venue.data && <div className="action-row">
          <h3>{venue.data.name}</h3>
          <StatusBadge status={venue.data.status} />
          <button className="button button--secondary" onClick={() => setTarget({
              type: 'venues',
              item: venue.data
            })}>Đổi trạng thái cơ sở</button>
        </div>}</WorkflowResource>
      <WorkflowResource resource={courts}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sân</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>{courts.data?.map(c => <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                <td>
                  <button className="button button--secondary" onClick={() => setTarget({
                      type: 'courts',
                      item: c
                    })}>Đổi trạng thái sân</button>
                </td>
              </tr>)}</tbody>
          </table>
        </div>
      </WorkflowResource>
    </div>
  </section><section className="panel">
    <div className="panel__header">
      <h2>Khóa / mở khung giờ</h2>
      <div className="workflow-filters">
        <Field label="Sân">
          <select className="input" value={courtId || ''} onChange={e => setCourt(e.target.value)}>{courts.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <Field label="Ngày">
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
      </div>
    </div>
    <div className="panel__body">
      <Notice type="info">Ca HELD/BOOKED chỉ được xử lý qua nghiệp vụ booking. Thay đổi luôn kiểm tra phiên bản.</Notice>
      <WorkflowResource resource={slots}>
        <SlotGrid slots={slots.data || []} admin onSelect={s => {
            if (['AVAILABLE', 'UNAVAILABLE'].includes(s.status)) setTarget({
              type: 'slots',
              item: s
            });
          }} />
      </WorkflowResource>
    </div>
  </section>{target && <OperationModal {...target} statusAction={admin.status} onClose={() => setTarget(null)} onReload={() => {
      setTarget(null);
      reload();
    }} onDone={msg => {
      setTarget(null);
      setMessage(msg);
      reload();
    }} />}</>;
}
