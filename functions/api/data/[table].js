import { currentUser, json } from '../../_lib/auth.js';

const LISTS = ['subjects', 'tasks', 'notes', 'teachers', 'contacts', 'places', 'standing_logs', 'vault_entries'];
const DOCS = ['profiles', 'app_settings', 'academic_structures'];

export async function onRequest({ request, env, params }) {
  const uid = await currentUser(request, env);
  if (!uid) return json({ error: 'unauthorized' }, 401);
  const table = params.table;
  const isList = LISTS.includes(table);
  if (!isList && !DOCS.includes(table)) return json({ error: 'unknown table' }, 404);

  if (request.method === 'GET') {
    if (isList) {
      const { results } = await env.DB.prepare('SELECT data FROM records WHERE user_id = ? AND tbl = ?')
        .bind(uid, table).all();
      return json({ data: results.map((r) => JSON.parse(r.data)) });
    }
    const row = await env.DB.prepare('SELECT data FROM docs WHERE user_id = ? AND key = ?').bind(uid, table).first();
    return json({ data: row ? JSON.parse(row.data) : null });
  }

  if (request.method === 'PUT') {
    const body = await request.json();
    if (!isList) {
      await env.DB.prepare(
        `INSERT INTO docs (user_id, key, data, updated_at) VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(user_id, key) DO UPDATE SET data = ?3, updated_at = datetime('now')`
      ).bind(uid, table, JSON.stringify(body ?? {})).run();
      return json({ ok: true });
    }
    const rows = Array.isArray(body) ? body.filter((r) => r && r.id != null) : [];
    // Replace this user's rows for the table in one atomic batch
    const stmts = [env.DB.prepare('DELETE FROM records WHERE user_id = ? AND tbl = ?').bind(uid, table)];
    const ins = env.DB.prepare(
      `INSERT OR REPLACE INTO records (user_id, tbl, id, data, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`
    );
    for (const r of rows) stmts.push(ins.bind(uid, table, String(r.id), JSON.stringify(r)));
    await env.DB.batch(stmts);
    return json({ ok: true, count: rows.length });
  }

  return json({ error: 'method not allowed' }, 405);
}
