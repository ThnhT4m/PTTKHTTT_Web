export const ROLES = ['CUSTOMER', 'VENUE_MANAGER', 'ADMIN'];
export const homeFor = (role) => role === 'ADMIN' ? '/admin' :
  role === 'VENUE_MANAGER' ? '/manager/venues' : '/venues';
export const canAccess = (user, roles) => !!user && (!roles || roles.includes(user.role));
