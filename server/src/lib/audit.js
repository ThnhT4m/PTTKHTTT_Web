const redact = (value) => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/password|token|secret/i.test(key))
      .map(([key, entry]) => [key, entry instanceof Date ? entry.toISOString() : redact(entry)]),
  );
};

export async function writeAudit(
  trx,
  { actorId, action, entityType, entityId, before, after, reason },
) {
  const [entry] = await trx('audit_logs')
    .insert({
      actor_id: actorId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      before_data: before == null ? null : JSON.stringify(redact(before)),
      after_data: after == null ? null : JSON.stringify(redact(after)),
      reason: reason || null,
    })
    .returning('*');
  return entry;
}
