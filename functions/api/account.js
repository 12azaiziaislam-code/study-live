import { currentUser, json, cookie } from '../_lib/auth.js';

export async function onRequestDelete({ request, env }) {
  const uid = await currentUser(request, env);
  if (!uid) return json({ error: 'unauthorized' }, 401);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM records WHERE user_id = ?').bind(uid),
    env.DB.prepare('DELETE FROM docs WHERE user_id = ?').bind(uid),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid),
  ]);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('sl_session', '', 0) });
}
