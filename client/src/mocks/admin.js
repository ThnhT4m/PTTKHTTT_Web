import { fail, bodyFields, findRow, publicUser, audit } from './rules.js';
import { writeCatalogue } from './catalogue.js';
export function writeAdmin(db, args) {
  const { path, method, body, user, now } = args;
  if (!path.startsWith('/admin/') || method !== 'PATCH') return null;
  if (user.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Chỉ ADMIN được quản trị hệ thống.');
  if (/^\/admin\/(venues|courts|slots)\/[^/]+\/status$/.test(path)) return writeCatalogue(db, { ...args, path: path.replace(/^\/admin/, '') });
  const match = path.match(/^\/admin\/users\/([^/]+)\/status$/);
  if (!match) return null;
  bodyFields(body, ['is_active', 'role']);
  if (!Object.keys(body).length || (body.is_active !== undefined && typeof body.is_active !== 'boolean') || (body.role !== undefined && !['CUSTOMER', 'VENUE_MANAGER'].includes(body.role))) fail(400, 'VALIDATION_ERROR', 'Chỉ cập nhật is_active boolean hoặc role CUSTOMER/VENUE_MANAGER.');
  const account = findRow(db.users, match[1]);
  if (account.id === user.id && (body.is_active === false || (body.role && body.role !== account.role))) fail(409, 'SELF_ADMIN_PROTECTED', 'Không thể tự khóa hoặc hạ quyền ADMIN đang đăng nhập.');
  if (account.role === 'ADMIN' && body.role && body.role !== 'ADMIN') fail(409, 'ADMIN_PROTECTED', 'Không hỗ trợ hạ quyền ADMIN.');
  if (body.role === 'CUSTOMER' && db.venues.some((v) => v.manager_id === account.id)) fail(409, 'MANAGER_HAS_VENUES', 'Cần chuyển giao các cơ sở trước khi hạ quyền manager.');
  const before = structuredClone(account);
  Object.assign(account, body, { updated_at: new Date(now).toISOString() });
  db.sessionVersions ||= {}; db.sessionVersions[account.id] = (db.sessionVersions[account.id] || 0) + 1;
  audit(db, user, 'USER_ACCESS_UPDATED', 'users', publicUser(account), before, now, 'Quản trị thay đổi quyền hoặc trạng thái tài khoản');
  return { data: publicUser(account), status: 200 };
}
