import { sign, cookie, json } from '../../_lib/auth.js';
import { hashPassword, publicUser } from '../../_lib/password.js';

const MAX_AGE = 60 * 60 * 24 * 60; // 60 days

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: 'bad_request' }, 400); }
  const username = String(b.username || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');

  if (!/^[\p{L}\p{N}_.-]{3,30}$/u.test(username)) return json({ error: 'invalid_username' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid_email' }, 400);
  if (password.length < 8) return json({ error: 'weak_password' }, 400);

  const exists = await env.DB.prepare('SELECT email, username FROM users WHERE email = ? OR lower(username) = lower(?)')
    .bind(email, username).first();
  if (exists) return json({ error: exists.email === email ? 'email_taken' : 'username_taken' }, 409);

  const { salt, hash } = await hashPassword(password);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO users (id, email, username, full_name, password_hash, salt) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, email, username, username, hash, salt).run();

  const session = await sign({ uid: id, exp: Date.now() + MAX_AGE * 1000 }, env.SESSION_SECRET);
  return json({ user: publicUser({ id, email, username, full_name: username }) }, 200,
    { 'Set-Cookie': cookie('sl_session', session, MAX_AGE) });
}
