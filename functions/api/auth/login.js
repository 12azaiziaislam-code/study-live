import { sign, cookie, json } from '../../_lib/auth.js';
import { hashPassword, safeEqual, publicUser } from '../../_lib/password.js';

const MAX_AGE = 60 * 60 * 24 * 60; // 60 days

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: 'bad_request' }, 400); }
  const login = String(b.login || '').trim();
  const password = String(b.password || '');
  if (!login || !password) return json({ error: 'invalid_credentials' }, 401);

  const u = await env.DB.prepare('SELECT * FROM users WHERE email = lower(?) OR lower(username) = lower(?)')
    .bind(login, login).first();
  if (!u || !u.password_hash) return json({ error: 'invalid_credentials' }, 401);

  const { hash } = await hashPassword(password, u.salt);
  if (!safeEqual(hash, u.password_hash)) return json({ error: 'invalid_credentials' }, 401);

  const session = await sign({ uid: u.id, exp: Date.now() + MAX_AGE * 1000 }, env.SESSION_SECRET);
  return json({ user: publicUser(u) }, 200, { 'Set-Cookie': cookie('sl_session', session, MAX_AGE) });
}
