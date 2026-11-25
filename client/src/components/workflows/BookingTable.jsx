import { StatusBadge, money, dateVN, timeVN } from '../shared';
export default function BookingTable({
  rows,
  actions
}) {
  return <div className="table-wrap">
    <table className="data-table workflow-table">
      <thead>
        <tr>
          <th>Khách hàng / mã đơn</th>
          <th>Sân và giờ</th>
          <th>Nguồn / tiền sân</th>
          <th>Trạng thái</th>
          <th>Thao tác</th>
        </tr>
      </thead>
      <tbody>{rows?.map(b => <tr key={b.id}>
          <td>
            {b.customer_name || 'Khách tại quầy'}
            <small>{b.id}</small>
            {b.customer_phone && <small>{b.customer_phone}</small>}
          </td>
          <td>
            {b.court_name}
            <small>{dateVN(b.start_at)} · {timeVN(b.start_at)} – {timeVN(b.end_at)}</small>
          </td>
          <td>
            {b.source}
            <small>{money(b.total_amount)}</small>
          </td>
          <td>
            <StatusBadge status={b.status} />
            {b.issue_reported_at && <small>Có sự cố sân</small>}
          </td>
          <td>
            <div className="action-row">{actions(b)}</div>
          </td>
        </tr>)}</tbody>
    </table>
  </div>;
}
