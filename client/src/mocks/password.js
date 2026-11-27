const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const unhex = (text) => Uint8Array.from(text.match(/.{2}/g) || [], (value) => parseInt(value, 16));
async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: 100000 }, key, 256)));
}
export async function hashMockPassword(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await derive(password, salt) };
}
export async function verifyMockPassword(password, credential) {
  return credential && await derive(password, credential.salt) === credential.hash;
}
