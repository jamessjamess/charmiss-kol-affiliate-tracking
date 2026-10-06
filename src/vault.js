/* vault.js — CR-08 §4.4 Payee vault (Web Crypto only, nothing from outside):
   - one RSA-OAEP 3072 key pair: the public key (stored as JWK) encrypts, so anyone allowed can save bank details without the passphrase;
   - the private key is wrapped with AES-GCM 256 derived from the passphrase (PBKDF2-SHA-256, 600,000 rounds, 16-byte salt) and is
     only unwrapped in memory as a non-extractable key after Unlock; the passphrase itself is never kept;
   - each payee record gets its own AES-GCM 256 key (wrapped with the public key) → secure {key_id, wrapped_key, iv, ciphertext};
   - Lock = forget the private key · auto-lock after 15 minutes without use · a reload starts locked.
   Nothing here writes to storage or to the console. → KT.vault */
KT.vault = (function () {
  'use strict';
  const cr = window.crypto, subtle = cr && cr.subtle;
  const ITERATIONS = 600000, IDLE_MS = 15 * 60 * 1000;
  const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const rand = n => cr.getRandomValues(new Uint8Array(n));
  const hex = a => [...a].map(x => x.toString(16).padStart(2, '0')).join('');
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let session = null;   // { keyId, privateKey, last }
  let timer = null;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(!!session); } catch (e) { /* a listener's own problem */ } });

  /* this browser can encrypt (crypto.subtle needs a secure context: https, localhost or file:// in Chrome / Edge) */
  const available = () => !!subtle;
  async function kekFrom(passphrase, salt, iterations) {
    const base = await subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
  }
  /* Set up (once): a new key pair, the private key wrapped with the passphrase → lookups.payee_vault (no secret in it) */
  async function setup(passphrase, meta = {}) {
    const pair = await subtle.generateKey(Object.assign({ modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, RSA), true, ['encrypt', 'decrypt']);
    const salt = rand(16), iv = rand(12), iterations = meta.iterations || ITERATIONS;
    const wrapped = await subtle.wrapKey('pkcs8', pair.privateKey, await kekFrom(passphrase, salt, iterations), { name: 'AES-GCM', iv });
    return { key_id: 'VK-' + hex(rand(6)), public_key_jwk: await subtle.exportKey('jwk', pair.publicKey), wrapped_private_key: b64(wrapped), salt: b64(salt), iv: b64(iv),
      iterations, created_at: meta.now || null, created_by: meta.user || null, passphrase_changed_at: null };
  }
  /* null = wrong passphrase (the AES-GCM tag does not match) */
  async function unwrapPrivate(vault, passphrase, extractable) {
    try { return await subtle.unwrapKey('pkcs8', unb64(vault.wrapped_private_key), await kekFrom(passphrase, unb64(vault.salt), vault.iterations), { name: 'AES-GCM', iv: unb64(vault.iv) }, RSA, extractable, ['decrypt']); }
    catch (e) { return null; }
  }
  async function unlock(vault, passphrase) {
    if (!vault || !available()) return false;
    const key = await unwrapPrivate(vault, passphrase, false);
    if (!key) return false;
    session = { keyId: vault.key_id, privateKey: key, last: clock() };
    if (!timer) { timer = setInterval(() => idleCheck(), 30000); if (timer && timer.unref) timer.unref(); }
    emit(); return true;
  }
  function lock() {
    if (timer) { clearInterval(timer); timer = null; }
    if (!session) return;
    session = null; emit();
  }
  const isUnlocked = vault => !!session && (!vault || vault.key_id === session.keyId);
  /* any use keeps it open; 15 minutes without use locks it (t = a clock reading, for tests) */
  const touch = () => { if (session) session.last = clock(); };
  function idleCheck(t) { if (session && (t != null ? t : clock()) - session.last >= IDLE_MS) lock(); }
  /* the same key pair under a new passphrase (the records are not touched) · null = the old passphrase is wrong */
  async function changePassphrase(vault, oldPass, newPass, meta = {}) {
    const key = await unwrapPrivate(vault, oldPass, true);
    if (!key) return null;
    const salt = rand(16), iv = rand(12);
    const wrapped = await subtle.wrapKey('pkcs8', key, await kekFrom(newPass, salt, vault.iterations), { name: 'AES-GCM', iv });
    return Object.assign({}, vault, { wrapped_private_key: b64(wrapped), salt: b64(salt), iv: b64(iv), passphrase_changed_at: meta.now || null });
  }
  /* a record (plain object) → secure · needs only the public key */
  async function encrypt(vault, obj) {
    const pub = await subtle.importKey('jwk', vault.public_key_jwk, RSA, false, ['encrypt']);
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const iv = rand(12), ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    const wrapped = await subtle.encrypt(RSA, pub, await subtle.exportKey('raw', key));
    return { key_id: vault.key_id, wrapped_key: b64(wrapped), iv: b64(iv), ciphertext: b64(ct) };
  }
  /* secure → the record, in memory only · null when locked or the record belongs to another vault */
  async function decrypt(secure) {
    if (!session || !secure || secure.key_id !== session.keyId) return null;
    touch();
    try {
      const raw = await subtle.decrypt(RSA, session.privateKey, unb64(secure.wrapped_key));
      const key = await subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
      return JSON.parse(td.decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(secure.iv) }, key, unb64(secure.ciphertext))));
    } catch (e) { return null; }
  }
  const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  if (typeof document !== 'undefined' && document.addEventListener) ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, touch, true));

  return { ITERATIONS, IDLE_MS, available, setup, unlock, lock, isUnlocked, touch, idleCheck, changePassphrase, encrypt, decrypt, onChange };
})();
