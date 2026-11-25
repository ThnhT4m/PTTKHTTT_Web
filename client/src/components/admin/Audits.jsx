import { useState } from 'react';
import { useWorkflowResource } from '../../hooks/useWorkflowResource.js';
import { pagePath } from '../../services/customer.js';
import { redactSecrets } from '../../utils/redact.js';
import { Field, Notice, dateVN, timeVN } from '../shared';
import { WorkflowResource, Pagination } from '../workflows/ResourceState';
export default function Audits() {
  const [filters, setFilters] = useState({}),
    [offset, setOffset] = useState(0),
    [error, setError] = useState('');
  const audits = useWorkflowResource(pagePath('/admin/audit-logs', filters, offset));
  function submit(e) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (['actor_id', 'entity_id'].some(key => values[key] && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values[key]))) {
      setError('Mã người thực hiện và đối tượng phải là UUID hợp lệ.');
      return;
    }
    setError('');
    setFilters(values);
    setOffset(0);
  }
  return <section className="panel">
    <div className="panel__header">
      <h2>Nhật ký thay đổi</h2>
      <button className="button button--secondary" onClick={audits.reload}>Tải lại</button>
    </div>
    <div className="panel__body">
      <form className="workflow-filters" onSubmit={submit}>
        <Field label="Mã người thực hiện">
          <input className="input" name="actor_id" />
        </Field>
        <Field label="Mã đối tượng">
          <input className="input" name="entity_id" />
        </Field>
        <Field label="Hành động">
          <input className="input" name="action" />
        </Field>
        <button className="button button--primary">Lọc nhật ký</button>
      </form>
      <Notice>{error}</Notice>
      <WorkflowResource resource={audits} empty="Chưa có nhật ký phù hợp.">
        <div className="table-wrap">
          <table className="data-table workflow-table">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Người thực hiện</th>
                <th>Đối tượng / hành động</th>
                <th>Lý do / dữ liệu</th>
              </tr>
            </thead>
            <tbody>{audits.data?.map(a => <tr key={a.id}>
                <td>
                  {dateVN(a.created_at)}
                  <small>{timeVN(a.created_at)}</small>
                </td>
                <td>
                  {a.actor_name || 'Hệ thống'}
                  <small>{a.actor_id}</small>
                </td>
                <td>
                  {a.action}
                  <small>{a.entity_type} · {a.entity_id}</small>
                </td>
                <td>
                  <p>{a.reason}</p>
                  <details className="audit-details">
                    <summary>Xem dữ liệu thay đổi</summary>
                    <pre>{JSON.stringify(redactSecrets({
                        truoc: a.before_data,
                        sau: a.after_data
                      }), null, 2)}</pre>
                  </details>
                </td>
              </tr>)}</tbody>
          </table>
        </div>
      </WorkflowResource>
      <Pagination offset={offset} count={audits.data?.length || 0} loading={audits.loading} onChange={setOffset} />
    </div>
  </section>;
}
