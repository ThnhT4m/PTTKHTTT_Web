import { Field, Notice, BookingSummary } from '../shared';
import ActionModal from './ActionModal';
import { operations } from '../../services/operations.js';
import { reasonError } from '../../utils/managerValidation.js';
export default function IssueModal({
  booking,
  refund,
  ...props
}) {
  return <ActionModal title={refund ? 'Lập yêu cầu hoàn tiền' : 'Báo sự cố sân'} {...props} validate={v => reasonError(v.reason)} action={v => operations.report(booking.id, {
    reason: v.reason.trim(),
    action: refund ? 'REFUND' : 'REPORT'
  })}>
    <BookingSummary booking={booking} />
    <Notice type="info">Ca gặp sự cố sẽ ngưng phục vụ. {refund ? 'Chỉ tạo yêu cầu khi có giao dịch PAID phù hợp; đây là nghiệp vụ hoàn tiền sandbox, chưa chuyển tiền thật.' : 'Khách có thể dời lịch hoặc yêu cầu hoàn tiền sau khi sự cố được ghi nhận.'}</Notice>
    <Field label="Mô tả sự cố">
      <textarea className="input" name="reason" required minLength={5} maxLength={1000} defaultValue={booking.issue_reason || ''} />
    </Field>
  </ActionModal>;
}
