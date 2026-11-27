import { useRef, useState } from 'react';
import { Modal, Field, Notice, dateVN, todayVN } from '../shared';
import { addDays } from '../../utils/format.js';
import { scheduleErrors } from '../../utils/managerValidation.js';
import { manager } from '../../services/manager.js';
import { ApiError } from '../../api/errors.js';
import { MutationFeedback } from './ResourceState';

export default function GenerateModal({ venue, courts, onDone, onClose, onReload }) {
  const active = courts.filter((c) => c.status === 'ACTIVE');
  const [all, setAll] = useState(true), [ids, setIds] = useState([]);
  const [start, setStart] = useState(todayVN()), [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [result, setResult] = useState(null);
  const locked = useRef(false), [unknown, setUnknown] = useState(false);
  const values = { start_date: start, days: Number(days), ...(!all ? { court_ids: ids } : {}) };
  const errors = scheduleErrors(values), count = all ? active.length : ids.length;
  const end = !errors.start_date && !errors.days ? addDays(start, Number(days) - 1) : null;
  async function submit(event) {
    event.preventDefault(); if (locked.current || unknown) return;
    locked.current = true;
    setBusy(true); setError(null); setResult(null);
    try {
      if (Object.keys(errors).length || !count) throw new ApiError({ message: Object.values(errors)[0] || 'Chọn ít nhất một sân ACTIVE.', code: 'VALIDATION_ERROR' }, 400);
      const { data } = await manager.generate(venue.id, values);
      setResult(data); onDone(data);
    } catch (err) {
      if (err.kind === 'network' || !err.status || err.status >= 500) setUnknown(true);
      setError(err);
    } finally { locked.current = false; setBusy(false); }
  }
  return <Modal title="Sinh lịch sân" onClose={() => { if (!busy) onClose(); }}>
    <MutationFeedback error={error} onReload={onReload} />
    {unknown && <Notice>Chưa xác định được kết quả sinh lịch. Đóng biểu mẫu và tải lại lịch để kiểm tra trước khi thao tác tiếp.</Notice>}
    <form className="form-stack" onSubmit={submit}><fieldset className="manager-form" disabled={busy || unknown}>
      <label className="manager-check"><input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); setResult(null); }} /> Tất cả sân ACTIVE ({active.length})</label>
      {!all && <div className="manager-court-options">{active.map((c) => <label className="manager-check" key={c.id}><input type="checkbox" checked={ids.includes(c.id)} onChange={(e) => { setIds((old) => e.target.checked ? [...old, c.id] : old.filter((id) => id !== c.id)); setResult(null); }} />{c.name}</label>)}</div>}
      {!active.length && <Notice>Cơ sở chưa có sân ACTIVE. Hãy thêm sân hoặc kích hoạt sân trước.</Notice>}
      <div className="form-grid"><Field label="Ngày bắt đầu"><input className="input" type="date" min={todayVN()} max={addDays(todayVN(), 30)} value={start} onChange={(e) => { setStart(e.target.value); setResult(null); }} required /></Field><Field label="Số ngày"><input className="input" type="number" min={1} max={30} step={1} value={days} onChange={(e) => { setDays(e.target.value); setResult(null); }} required /></Field></div>
      <Notice type="info">{end ? `${dateVN(start)} – ${dateVN(end)} · ${count} sân · dự kiến ${count * Number(days) * 16} ca.` : 'Chọn khoảng ngày hợp lệ.'} Mỗi ngày có 16 ca 60 phút, 06:00–22:00. Ca đã tồn tại được bỏ qua, giữ nguyên giá và giao dịch.</Notice>
      {Object.keys(errors).length > 0 && <Notice>{Object.values(errors)[0]}</Notice>}
      {result && <div className="manager-generation-result" role="status"><h3>Kết quả từ máy chủ</h3><p>{dateVN(result.start_date)} – {dateVN(result.end_date)}</p><dl className="summary-list"><div className="summary-list__row"><dt>Số sân xử lý</dt><dd>{result.court_count}</dd></div><div className="summary-list__row"><dt>Ca tạo mới</dt><dd>{result.created}</dd></div><div className="summary-list__row"><dt>Ca đã tồn tại, bỏ qua</dt><dd>{result.skipped}</dd></div></dl></div>}
      <div className="form-actions"><button className="button button--secondary" type="button" onClick={onClose}>Đóng</button><button className="button button--primary" disabled={busy || unknown || !count || venue.status !== 'ACTIVE' || Object.keys(errors).length > 0}>{busy ? 'Đang sinh lịch…' : 'Sinh lịch'}</button></div>
    </fieldset></form>
  </Modal>;
}
