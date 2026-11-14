import { cookie, json } from '../../_lib/auth.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': cookie('sl_session', '', 0) });
}
