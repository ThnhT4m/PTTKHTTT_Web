import { useState } from 'react';
import { Field, Empty, SPORTS, StatusBadge, money } from '../shared';

export default function CourtList({ courts, onEdit, onStatus, onRemove, onSchedule }) {
  const [name, setName] = useState(''), [sport, setSport] = useState(''), [status, setStatus] = useState('');
  const filtered = courts.filter((c) => c.name.toLocaleLowerCase('vi').includes(name.toLocaleLowerCase('vi')) && (!sport || c.sport_type === sport) && (!status || c.status === status));
  return <>
    <div className="panel__body manager-filters">
      <Field label="Tìm sân"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhập tên sân…" /></Field>
      <Field label="Bộ môn"><select className="input" value={sport} onChange={(e) => setSport(e.target.value)}><option value="">Tất cả bộ môn</option>{Object.entries(SPORTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label="Trạng thái"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option><option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option><option value="MAINTENANCE">Bảo trì</option></select></Field>
      <span className="muted">{filtered.length}/{courts.length} sân</span>
    </div>
    <div className="table-wrap"><table className="data-table manager-court-table"><thead><tr><th>Tên sân</th><th>Bộ môn</th><th>Giá mặc định / giờ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{filtered.map((c) => <tr key={c.id} data-court-id={c.id}>
      <td><strong>{c.name}</strong><small>{c.description}</small></td><td>{SPORTS[c.sport_type]}</td><td>{money(c.hourly_price)}</td><td><StatusBadge status={c.status} /></td><td><div className="action-row manager-court-actions">
        <button className="button button--ghost button--small" onClick={() => onEdit(c)}>Chỉnh sửa</button><button className="button button--secondary button--small" onClick={() => onStatus(c)}>Đổi trạng thái</button><button className="button button--ghost button--small" onClick={() => onSchedule(c)}>Xem lịch</button><button className="button button--danger button--small" onClick={() => onRemove(c)}>Xóa mềm</button>
      </div></td>
    </tr>)}</tbody></table>{!filtered.length && <Empty>Không có sân phù hợp với bộ lọc.</Empty>}</div>
  </>;
}
