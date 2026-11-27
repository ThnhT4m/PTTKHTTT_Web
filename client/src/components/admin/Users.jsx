import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkflowResource, useDebounced } from '../../hooks/useWorkflowResource.js';
import { admin } from '../../services/admin.js';
import { pagePath } from '../../services/customer.js';
import { Field, StatusBadge, Notice } from '../shared';
import { WorkflowResource, Pagination } from '../workflows/ResourceState';
import ActionModal from '../workflows/ActionModal';
export default function Users() {
  const {
    user
  } = useAuth();
  const [search, setSearch] = useState(''),
    [role, setRole] = useState(''),
    [active, setActive] = useState(''),
    [offset, setOffset] = useState(0),
    [target, setTarget] = useState(null),
    [message, setMessage] = useState('');
  const q = useDebounced(search),
    users = useWorkflowResource(pagePath('/admin/users', {
      q,
      role,
      is_active: active
    }, offset));
  const venues = useWorkflowResource('/venues#admin-users', {
    load: admin.venues
  });
  function done() {
    setTarget(null);
    setMessage('Đã cập nhật tài khoản và thu hồi các phiên đăng nhập cũ.');
    users.reload();
  }
  return <section className="panel">
    <div className="panel__header">
      <h2>Quản lý tài khoản</h2>
      <button className="button button--secondary" onClick={() => {
        users.reload();
        venues.reload();
      }}>Tải lại</button>
    </div>
    <div className="panel__body">
      <Notice type="success">{message}</Notice>
      <div className="workflow-filters">
        <Field label="Tìm tài khoản">
          <input className="input" value={search} onChange={e => {
            setSearch(e.target.value);
            setOffset(0);
          }} />
        </Field>
        <Field label="Vai trò">
          <select className="input" value={role} onChange={e => {
            setRole(e.target.value);
            setOffset(0);
          }}>
            <option value="">Tất cả</option>
            {['CUSTOMER', 'VENUE_MANAGER', 'ADMIN'].map(r => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Trạng thái tài khoản">
          <select className="input" value={active} onChange={e => {
            setActive(e.target.value);
            setOffset(0);
          }}>
            <option value="">Tất cả</option>
            <option value="true">Hoạt động</option>
            <option value="false">Đã khóa</option>
          </select>
        </Field>
      </div>
      <WorkflowResource resource={users} empty="Không tìm thấy tài khoản.">
        <div className="table-wrap">
          <table className="data-table workflow-table">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>{users.data?.map(u => {
                const owns = venues.loading || !!venues.error || venues.data?.some(v => v.manager_id === u.id);
                return <tr key={u.id}>
                <td>
                  {u.full_name}
                  <small>{u.email}</small>
                  <small>{u.id}</small>
                </td>
                <td>
                  <StatusBadge status={u.role} />
                </td>
                <td>
                  <StatusBadge status={u.is_active ? 'ACTIVE' : 'INACTIVE'} />
                </td>
                <td>
                  <div className="action-row">
                    <button className="button button--secondary" disabled={u.id === user.id} onClick={() => setTarget({
                        user: u,
                        values: {
                          is_active: !u.is_active
                        }
                      })}>{u.is_active ? 'Khóa' : 'Mở khóa'}</button>
                    {u.role !== 'ADMIN' && <button className="button button--secondary" disabled={u.role === 'VENUE_MANAGER' && owns} title={u.role === 'VENUE_MANAGER' && owns ? 'Không thể hạ quyền khi còn sở hữu cơ sở hoặc chưa tải được phạm vi sở hữu.' : ''} onClick={() => setTarget({
                        user: u,
                        values: {
                          role: u.role === 'CUSTOMER' ? 'VENUE_MANAGER' : 'CUSTOMER'
                        }
                      })}>{u.role === 'CUSTOMER' ? 'Cấp quyền quản lý' : 'Hạ quyền khách hàng'}</button>}
                  </div>
                </td>
              </tr>;
              })}</tbody>
          </table>
        </div>
      </WorkflowResource>
      <Pagination offset={offset} count={users.data?.length || 0} loading={users.loading} onChange={setOffset} />
    </div>
    {target && <ActionModal title="Xác nhận cập nhật tài khoản" onClose={() => setTarget(null)} onDone={done} action={() => admin.updateUser(target.user.id, target.values)}>
      <p>{target.user.full_name} · {target.user.email}</p>
      <p>{target.values.role ? `Vai trò mới: ${target.values.role}` : target.values.is_active ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}</p>
      <Notice type="info">Các phiên đăng nhập cũ của tài khoản sẽ bị thu hồi. Manager còn sở hữu cơ sở không thể bị hạ quyền.</Notice>
    </ActionModal>}
  </section>;
}
