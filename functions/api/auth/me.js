import { currentUser, json } from '../../_lib/auth.js';
import { publicUser } from '../../_lib/password.js';

export async function onRequestGet({ request, env }) {
  const uid = await currentUser(request, env);
  if (!uid) return json({ user: null });
  const u = await env.DB.prepare('SELECT id, email, username, full_name FROM users WHERE id = ?').bind(uid).first();
  return json({ user: u ? publicUser(u) : null });
}
