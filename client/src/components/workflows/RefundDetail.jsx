import { Modal, money, dateVN, timeVN, StatusBadge } from '../shared';
import { useWorkflowResource } from '../../hooks/useWorkflowResource.js';
import { WorkflowResource } from './ResourceState';
export default function RefundDetail({
  id,
  onClose,
  onBooking
}) {
  const resource = useWorkflowResource(`/refunds/${id}`),
    r = resource.data;
  return <Modal title="Chi tiết yêu cầu hoàn tiền" onClose={onClose}>
    <WorkflowResource resource={resource}>{r && <><p>Mã yêu cầu: {r.id}</p><p>
        Booking:
        <button className="button button--secondary" onClick={() => onBooking(r.booking_id)}>{r.booking_id}</button>
      </p><p>{r.customer_name} · {r.venue_name} · {r.court_name}</p><p>{money(r.amount)} · {r.reason}</p><StatusBadge status={r.status} refund />{['created_at', 'approved_at', 'processing_at', 'completed_at', 'updated_at'].filter(key => r[key]).map(key => <p key={key}>{key}: {dateVN(r[key])} · {timeVN(r[key])}</p>)}</>}</WorkflowResource>
  </Modal>;
}
