const idAsc = (a, b) => a.id.localeCompare(b.id);
export function orderRows(rows, order = 'catalogue') {
  return [...rows].sort((a, b) => {
    if (order === 'catalogue') return (a.name || '').localeCompare(b.name || '', 'vi') || idAsc(a, b);
    if (order === 'history') return Date.parse(a.created_at) - Date.parse(b.created_at) || idAsc(a, b);
    return Date.parse(b.created_at) - Date.parse(a.created_at) || (order === 'audit' ? -idAsc(a, b) : idAsc(a, b));
  });
}
