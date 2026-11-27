import { useEffect, useState } from 'react';
import { Field, Notice, Empty, SlotLegend, StatusBadge, Modal, money, dateVN, timeVN, todayVN } from '../shared';
import { useManagerResource } from '../../hooks/useManagerResource.js';
import { useServerNow } from '../../hooks/useCustomerResource.js';
import { manager } from '../../services/manager.js';
import { MAX_PRICE, canEditSlotPrice, canChangeSlotStatus, validPrice } from '../../utils/managerValidation.js';
import { ApiError } from '../../api/errors.js';
import { ResourceState, MutationFeedback } from './ResourceState';
import OperationModal from './OperationModal';

function PriceModal({ slot, onClose, onDone, onReload }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const price = Number(new FormData(event.currentTarget).get('price'));
    setBusy(true); setError(null);
    try {
      if (!validPrice(price)) throw new ApiError({ message: 'Giá phải là số nguyên VND trong giới hạn cho phép.', code: 'VALIDATION_ERROR' }, 400);
      await manager.price(slot, price); onDone('Đã cập nhật giá ca. Giá booking đã tạo được giữ nguyên.');
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <Modal title="Chỉnh giá khung giờ" onClose={() => { if (!busy) onClose(); }}>
    <p>{dateVN(slot.start_at)} · {timeVN(slot.start_at)} – {timeVN(slot.end_at)}</p>
    <MutationFeedback error={error} onReload={onReload} />
    <form className="form-stack" onSubmit={submit}><fieldset className="manager-form" disabled={busy}>
      <Field label="Giá ca (VND)"><input className="input" name="price" type="number" min={0} max={MAX_PRICE} step={1} defaultValue={slot.price} required autoFocus /></Field>
      <Notice type="info">Chỉ chỉnh giá ca chưa bắt đầu, AVAILABLE hoặc UNAVAILABLE, không có booking hiệu lực. Máy chủ kiểm tra lại khi lưu.</Notice>
      <div className="form-actions"><button type="button" className="button button--secondary" onClick={onClose}>Đóng</button><button className="button button--primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu giá ca'}</button></div>
    </fieldset></form>
  </Modal>;
}
export default function ManagerSchedule({ courts, courtId, setCourtId, revision, onGenerate, venueActive }) {
  const [date, setDate] = useState(todayVN()), [selectedId, setSelectedId] = useState(''), [modal, setModal] = useState(null), [message, setMessage] = useState('');
  const slots = useManagerResource((options) => courtId && date ? manager.slots(courtId, date, options) : null, [courtId, date, revision]);
  const clock = useServerNow(slots.offset);
  const selected = slots.data?.find((s) => s.id === selectedId);
  useEffect(() => { setSelectedId(''); setMessage(''); }, [courtId, date]);
  function done(text) { setModal(null); setMessage(text); slots.reload(); }
  function reloadConflict() { setModal(null); setMessage('Đang tải dữ liệu mới. Kiểm tra lại ca rồi xác nhận thao tác nếu vẫn phù hợp.'); slots.reload(); }
  return <section aria-label="Lịch và giá sân">
    <div className="panel"><div className="panel__header manager-tools">
      <h2>Lịch và giá sân</h2><div className="action-row">
        <Field label="Sân quản lý"><select className="input" value={courtId} onChange={(e) => setCourtId(e.target.value)} aria-label="Sân quản lý">{courts.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Ngày xem lịch"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <button type="button" className="button button--secondary" onClick={slots.reload}>Tải lại lịch</button>
      </div>
    </div><div className="panel__body">
      <Notice type="success">{message}</Notice><SlotLegend />
      <ResourceState resource={slots} empty="Chưa có ca trong ngày này. Bạn có thể sinh lịch cho sân ACTIVE.">
        <div className="slot-grid manager-slot-grid">{slots.data?.map((s) => <button key={s.id} className={`slot-card slot-card--${s.status}${selectedId === s.id ? ' manager-slot--selected' : ''}`} type="button" aria-pressed={selectedId === s.id} onClick={() => setSelectedId(s.id)}>
          <span className="slot-card__time">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</span><span className="slot-card__price">{money(s.price)}</span><StatusBadge status={s.status} />
        </button>)}</div>
      </ResourceState>
      {!slots.loading && !slots.error && !slots.data?.length && <button className="button button--primary" disabled={!venueActive || !courts.some((c) => c.status === 'ACTIVE')} onClick={onGenerate}>Sinh lịch sân</button>}
    </div></div>
    {selected ? <div className="panel manager-slot-detail"><div className="panel__header"><h2>Khung giờ đã chọn</h2><StatusBadge status={selected.status} /></div><div className="panel__body">
      <p><strong>{dateVN(selected.start_at)} · {timeVN(selected.start_at)} – {timeVN(selected.end_at)}</strong> · {money(selected.price)}</p>
      {selected.held_until && <p className="muted">Giữ chỗ tới {timeVN(selected.held_until)} (giờ Việt Nam).</p>}
      <div className="action-row"><button className="button button--primary" disabled={!canEditSlotPrice(selected, clock)} onClick={() => setModal({ type: 'price', slot: selected })}>Chỉnh giá ca</button><button className="button button--secondary" disabled={!canChangeSlotStatus(selected)} onClick={() => setModal({ type: 'status', slot: selected })}>Đổi trạng thái ca</button></div>
      {!canEditSlotPrice(selected, clock) && <p className="muted">Không thể chỉnh giá ca đã bắt đầu hoặc đang HELD/BOOKED.</p>}
      {!canChangeSlotStatus(selected) && <Notice type="info">Ca đang HELD/BOOKED được bảo vệ. Không thể đổi giá hoặc trạng thái thủ công.</Notice>}
    </div></div> : !slots.loading && !!slots.data?.length && <Empty>Chọn một ca để xem chi tiết và các thao tác được phép.</Empty>}
    {modal?.type === 'price' && <PriceModal slot={modal.slot} onClose={() => setModal(null)} onDone={done} onReload={reloadConflict} />}
    {modal?.type === 'status' && <OperationModal type="slots" item={modal.slot} onClose={() => setModal(null)} onDone={done} onReload={reloadConflict} />}
  </section>;
}
