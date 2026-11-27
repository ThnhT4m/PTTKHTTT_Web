import { useState } from 'react';
import { PageHeader, money } from '../../components/shared';
import { useWorkflowResource } from '../../hooks/useWorkflowResource.js';
import { WorkflowResource } from '../../components/workflows/ResourceState';
import Users from '../../components/admin/Users';
import Operations from '../../components/admin/Operations';
import Audits from '../../components/admin/Audits';
import '../../styles/operations.css';
export default function AdminPage() {
  const [tab, setTab] = useState('users');
  const overview = useWorkflowResource('/admin/overview');
  const stats = [['Cơ sở thể thao', 'total_venues'], ['Tổng lượt đặt sân', 'total_bookings'], ['Tài khoản', 'total_users'], ['Doanh thu toàn hệ thống', 'total_revenue']];
  return <div className="workflow-page">
    <PageHeader eyebrow="TOÀN BỘ HỆ THỐNG" title="Quản trị hệ thống" description="Thống kê, tài khoản, trạng thái vận hành và nhật ký thay đổi." />
    <WorkflowResource resource={overview}>
      <div className="metric-grid">{stats.map(([label, key]) => <article className="metric-card" key={key}>
          <span>{label}</span>
          <strong>{key === 'total_revenue' ? money(overview.data?.[key]) : overview.data?.[key] ?? '—'}</strong>
        </article>)}</div>
    </WorkflowResource>
    <button className="button button--secondary" onClick={overview.reload}>Tải lại thống kê</button>
    <div className="tabs">{[['users', 'Tài khoản'], ['operations', 'Trạng thái sân & cơ sở'], ['audit', 'Nhật ký thay đổi']].map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
    {tab === 'users' && <Users />}
    {tab === 'operations' && <Operations />}
    {tab === 'audit' && <Audits />}
  </div>;
}
