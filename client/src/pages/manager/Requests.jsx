import { useState } from 'react';
import { PageHeader, Field, Notice, BookingSummary, StatusBadge, money, dateVN, timeVN } from '../../components/shared';
import { useWorkflowResource } from '../../hooks/useWorkflowResource.js';
import { operations } from '../../services/operations.js';
import { pagePath } from '../../services/customer.js';
import { WorkflowResource, Pagination } from '../../components/workflows/ResourceState';
import BookingFilters from '../../components/workflows/BookingFilters';
import BookingDetail from '../../components/customer/BookingDetail';
import RescheduleModal from '../../components/workflows/RescheduleModal';
import IssueModal from '../../components/workflows/IssueModal';
import RefundDetail from '../../components/workflows/RefundDetail';
import ActionModal from '../../components/workflows/ActionModal';
import '../../styles/operations.css';
export default function RequestsPage() {
  const venues = useWorkflowResource('/venues#requests', {
    load: operations.venues
  });
  const [selection, setSelection] = useState(''),
    [filters, setFilters] = useState({
      status: 'CONFIRMED'
    }),
    [offset, setOffset] = useState(0);
  const [refundStatus, setRefundStatus] = useState(''),
    [refundOffset, setRefundOffset] = useState(0),
    [modal, setModal] = useState(null),
    [message, setMessage] = useState('');
  const venueId = selection || venues.data?.[0]?.id;
  const courts = useWorkflowResource(venueId ? '/venues/' + venueId + '/courts#requests' : null, {
    load: o => operations.courts(venueId, o)
  });
  const bookings = useWorkflowResource(venueId ? pagePath('/bookings', {
    ...filters,
    venue_id: venueId
  }, offset) : null);
  const refunds = useWorkflowResource(venueId ? pagePath('/refunds', {
    venue_id: venueId,
    status: refundStatus
  }, refundOffset) : null);
  function reload() {
    bookings.reload();
    refunds.reload();
  }
  function done() {
    setModal(null);
    setMessage('Đã xử lý và tải lại booking, hoàn tiền.');
    reload();
  }
  return <div className="workflow-page">
    <PageHeader eyebrow="CHĂM SÓC SAU ĐẶT SÂN" title="Hậu mãi & sự cố" description="Ghi nhận sự cố, dời sân và xử lý hoàn tiền sandbox." />
    <Notice type="success">{message}</Notice>
    <WorkflowResource resource={venues}>
      <Field label="Cơ sở">
        <select className="input" value={venueId || ''} onChange={e => {
          setSelection(e.target.value);
          setOffset(0);
          setRefundOffset(0);
          setFilters({
            status: 'CONFIRMED'
          });
        }}>{venues.data?.map(v => <option value={v.id} key={v.id}>{v.name}</option>)}</select>
      </Field>
    </WorkflowResource>
    <section className="panel">
      <div className="panel__header">
        <h2>Booking cần xử lý</h2>
        <button className="button button--secondary" onClick={reload}>Tải lại</button>
      </div>
      <div className="panel__body">
        <BookingFilters filters={filters} courts={courts.data} issue onChange={f => {
          setFilters(f);
          setOffset(0);
        }} />
        <WorkflowResource resource={courts}>
          <WorkflowResource resource={bookings} empty="Chưa có booking phù hợp.">
            <div className="booking-list">{bookings.data?.map(b => <article className="booking-card" key={b.id}>
                <div>
                  <strong>{b.customer_name || 'Khách tại quầy'} · {b.id}</strong>
                  <StatusBadge status={b.status} />
                  <BookingSummary booking={b} />
                  {b.issue_reported_at && <p>Sự cố: {b.issue_reason}</p>}
                  {b.refund_status && <StatusBadge status={b.refund_status} refund />}
                </div>
                <div className="action-row">
                  <button className="button button--secondary" onClick={() => setModal({
                    type: 'booking',
                    id: b.id
                  })}>Chi tiết</button>
                  <button className="button button--secondary" disabled={b.status !== 'CONFIRMED' || !!b.refund_status} onClick={() => setModal({
                    type: 'move',
                    booking: b
                  })}>Dời lịch</button>
                  <button className="button button--danger" disabled={b.status !== 'CONFIRMED' || !!b.issue_reported_at} onClick={() => setModal({
                    type: 'issue',
                    booking: b
                  })}>Báo sự cố</button>
                  <button className="button button--secondary" disabled={b.status !== 'CONFIRMED' || !!b.refund_status} onClick={() => setModal({
                    type: 'issue',
                    booking: b,
                    refund: true
                  })}>Lập yêu cầu hoàn tiền</button>
                </div>
              </article>)}</div>
          </WorkflowResource>
        </WorkflowResource>
        <Pagination offset={offset} count={bookings.data?.length || 0} loading={bookings.loading} onChange={setOffset} />
      </div>
    </section>
    <section className="panel">
      <div className="panel__header">
        <h2>Yêu cầu hoàn tiền</h2>
        <Field label="Trạng thái hoàn tiền">
          <select className="input" value={refundStatus} onChange={e => {
            setRefundStatus(e.target.value);
            setRefundOffset(0);
          }}>
            <option value="">Tất cả</option>
            {['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'].map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div className="panel__body">
        <Notice type="info">Hoàn tiền sandbox. Xác nhận tại đây không thực hiện chuyển tiền thật.</Notice>
        <WorkflowResource resource={refunds} empty="Chưa có yêu cầu hoàn tiền phù hợp.">
          <div className="table-wrap">
            <table className="data-table workflow-table">
              <thead>
                <tr>
                  <th>Yêu cầu / booking</th>
                  <th>Khách / cơ sở / sân</th>
                  <th>Số tiền / lý do</th>
                  <th>Trạng thái / thời gian</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>{refunds.data?.map(r => <tr key={r.id}>
                  <td>
                    {r.id}
                    <small>{r.booking_id}</small>
                  </td>
                  <td>
                    {r.customer_name}
                    <small>{r.venue_name} · {r.court_name}</small>
                  </td>
                  <td>
                    {money(r.amount)}
                    <small>{r.reason}</small>
                  </td>
                  <td>
                    <StatusBadge status={r.status} refund />
                    <small>{dateVN(r.created_at)} · {timeVN(r.created_at)}</small>
                  </td>
                  <td>
                    <div className="action-row">
                      <button className="button button--secondary" onClick={() => setModal({
                        type: 'refund',
                        id: r.id
                      })}>Chi tiết hoàn tiền</button>
                      {['REQUESTED', 'PROCESSING'].includes(r.status) && <button className="button button--primary" onClick={() => setModal({
                        type: 'transition',
                        refund: r,
                        status: r.status === 'REQUESTED' ? 'APPROVED' : 'COMPLETED'
                      })}>{r.status === 'REQUESTED' ? 'Duyệt hoàn tiền' : 'Xác nhận đã hoàn'}</button>}
                    </div>
                  </td>
                </tr>)}</tbody>
            </table>
          </div>
        </WorkflowResource>
        <Pagination offset={refundOffset} count={refunds.data?.length || 0} loading={refunds.loading} onChange={setRefundOffset} />
      </div>
    </section>
    {modal?.type === 'booking' && <BookingDetail key={modal.id} id={modal.id} onClose={() => setModal(null)} onRelated={id => setModal({
      type: 'booking',
      id
    })} />}
    {modal?.type === 'move' && <RescheduleModal booking={modal.booking} onClose={() => setModal(null)} onDone={done} />}
    {modal?.type === 'issue' && <IssueModal booking={modal.booking} refund={modal.refund} onClose={() => setModal(null)} onDone={done} onReload={reload} />}
    {modal?.type === 'refund' && <RefundDetail id={modal.id} onClose={() => setModal(null)} onBooking={id => setModal({
      type: 'booking',
      id
    })} />}
    {modal?.type === 'transition' && <ActionModal title={modal.status === 'APPROVED' ? 'Duyệt hoàn tiền sandbox' : 'Xác nhận hoàn tất sandbox'} onClose={() => setModal(null)} onDone={done} onReload={reload} action={() => operations.refundStatus(modal.refund.id, modal.status)}>
      <p>{modal.refund.id} · {money(modal.refund.amount)}</p>
      <Notice type="info">{modal.status === 'APPROVED' ? 'Duyệt yêu cầu; hệ thống ghi nhận APPROVED rồi PROCESSING.' : 'Xác nhận hoàn tất nghiệp vụ: payment REFUNDED, booking hủy bởi cơ sở, ca ngưng phục vụ.'} Đây là sandbox, không chuyển tiền thật.</Notice>
    </ActionModal>}
  </div>;
}
