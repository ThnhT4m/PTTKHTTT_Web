const privateKey = /password|token|credential|secret|authorization|(^|_)hash$|salt/i;
export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !privateKey.test(key)).map(([key, item]) => [key, redactSecrets(item)]));
}
