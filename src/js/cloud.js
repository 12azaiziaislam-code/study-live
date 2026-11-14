/* ============================================================
   Study Live — cloud.js
   Cloud sync + email/username/password sign-in via Cloudflare Pages Functions + D1.
   Exposes the same SL.supabase interface the app already uses.
   ============================================================ */
(function (root) {
  'use strict';

  var SL = (root.SL = root.SL || {});

  // Disable with VITE_CLOUD=off (e.g. plain `vite dev` without Functions)
  var ENABLED = import.meta.env.VITE_CLOUD !== 'off' && root.location && root.location.protocol !== 'file:';

  var currentUser = null;
  var sessionChecked = null;
  var authListeners = [];
  var lastSyncedHash = {};

  var LIST_TABLES = ['subjects', 'tasks', 'notes', 'teachers', 'contacts', 'places'];

  function api(path, opts) {
    opts = opts || {};
    return fetch('/api/' + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function emit(event) {
    authListeners.forEach(function (fn) { try { fn(event, currentUser); } catch (e) {} });
  }

  function getUser() { return currentUser; }
  function isConnected() { return !!currentUser; }
  function onAuthChange(fn) { authListeners.push(fn); }

  function getSession() {
    if (!ENABLED) return Promise.resolve(null);
    if (!sessionChecked) {
      sessionChecked = api('auth/me').then(function (res) {
        currentUser = res.user || null;
        if (currentUser) emit('SIGNED_IN');
        return currentUser ? { user: currentUser } : null;
      }).catch(function () { sessionChecked = null; return null; });
    }
    return sessionChecked;
  }

  function t(k) { return SL.i18n && SL.i18n.t ? SL.i18n.t(k) : k; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

  var EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function injectStyles() {
    if (document.getElementById('sl-auth-style')) return;
    var css =
      '.sl-auth{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px)}' +
      '.sl-auth-card{position:relative;width:100%;max-width:380px;background:var(--surface,#16130d);color:var(--ink,#f5efe0);border:1px solid var(--border-strong,#3a3020);border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
      '.sl-auth-tabs{display:flex;gap:6px;margin-bottom:16px;background:rgba(255,255,255,.04);padding:4px;border-radius:10px}' +
      '.sl-auth-tabs button{flex:1;min-height:40px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer;opacity:.7}' +
      '.sl-auth-tabs button.on{background:var(--accent,#d4af37);color:#111;opacity:1}' +
      '.sl-auth label{display:block;font-size:13px;opacity:.8;margin:10px 0 4px}' +
      '.sl-auth input{width:100%;box-sizing:border-box;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--border-strong,#3a3020);background:rgba(255,255,255,.03);color:inherit;font:inherit;font-size:16px}' +
      '.sl-auth input:focus{outline:none;border-color:var(--accent,#d4af37)}' +
      '.sl-auth-submit{width:100%;min-height:46px;margin-top:16px;border:0;border-radius:10px;background:var(--accent,#d4af37);color:#111;font:inherit;font-weight:700;cursor:pointer}' +
      '.sl-auth-submit:disabled{opacity:.6;cursor:wait}' +
      '.sl-auth-err{min-height:18px;margin-top:10px;font-size:13px;color:#ff6b6b}' +
      '.sl-pw{position:relative}.sl-auth .sl-pw input{padding-inline-end:46px}' +
      '.sl-pw-eye{position:absolute;top:0;inset-inline-end:0;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:inherit;opacity:.65;cursor:pointer}.sl-pw-eye:hover{opacity:1}' +
      '.sl-auth-x{position:absolute;top:8px;inset-inline-end:8px;width:36px;height:36px;border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer;opacity:.6}';
    var st = document.createElement('style');
    st.id = 'sl-auth-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // Opens the email / username / password form. Resolves with the user on
  // success, or null when the user closes it.
  function signIn() {
    if (!ENABLED) return Promise.reject(new Error('Cloud not configured'));
    injectStyles();
    var old = document.querySelector('.sl-auth');
    if (old) old.remove();
    var closable = !document.querySelector('.auth-gate, .login-gate');

    return new Promise(function (resolve) {
      var mode = 'login';
      var ov = document.createElement('div');
      ov.className = 'sl-auth';
      document.body.appendChild(ov);

      function render() {
        var reg = mode === 'register';
        ov.innerHTML =
          '<form class="sl-auth-card" novalidate>' +
          (closable ? '<button type="button" class="sl-auth-x" data-x aria-label="close">×</button>' : '') +
          '<div class="sl-auth-tabs">' +
          '<button type="button" data-m="login" class="' + (reg ? '' : 'on') + '">' + esc(t('auth.tabLogin')) + '</button>' +
          '<button type="button" data-m="register" class="' + (reg ? 'on' : '') + '">' + esc(t('auth.tabRegister')) + '</button>' +
          '</div>' +
          (reg
            ? '<label>' + esc(t('auth.username')) + '</label><input name="username" autocomplete="username" required>' +
              '<label>' + esc(t('auth.email')) + '</label><input name="email" type="email" autocomplete="email" required>' +
              '<label>' + esc(t('auth.password')) + '</label><div class="sl-pw"><input name="password" type="password" autocomplete="new-password" minlength="8" required><button type="button" class="sl-pw-eye" data-eye aria-label="show password">' + EYE + '</button></div>'
            : '<label>' + esc(t('auth.loginId')) + '</label><input name="login" autocomplete="username" required>' +
              '<label>' + esc(t('auth.password')) + '</label><div class="sl-pw"><input name="password" type="password" autocomplete="current-password" required><button type="button" class="sl-pw-eye" data-eye aria-label="show password">' + EYE + '</button></div>') +
          '<button type="submit" class="sl-auth-submit">' + esc(t(reg ? 'auth.submitRegister' : 'auth.submitLogin')) + '</button>' +
          '<div class="sl-auth-err" role="alert"></div>' +
          '</form>';

        var form = ov.querySelector('form');
        var err = ov.querySelector('.sl-auth-err');
        var submit = ov.querySelector('.sl-auth-submit');
        ov.querySelectorAll('[data-m]').forEach(function (b) {
          b.addEventListener('click', function () { mode = b.getAttribute('data-m'); render(); });
        });
        var x = ov.querySelector('[data-x]');
        if (x) x.addEventListener('click', function () { ov.remove(); resolve(null); });
        var eye = ov.querySelector('[data-eye]');
        if (eye) eye.addEventListener('click', function () {
          var inp = eye.previousElementSibling;
          var show = inp.type === 'password';
          inp.type = show ? 'text' : 'password';
          eye.innerHTML = show ? EYE_OFF : EYE;
          eye.setAttribute('aria-label', show ? 'hide password' : 'show password');
          inp.focus();
        });
        var first = form.querySelector('input');
        if (first) first.focus();

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var body = {};
          form.querySelectorAll('input').forEach(function (i) { body[i.name] = i.value; });
          submit.disabled = true;
          err.textContent = '';
          fetch('/api/auth/' + mode, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          }).then(function (r) {
            return r.json().catch(function () { return {}; });
          }).then(function (res) {
            if (!res.user) {
              var key = 'auth.err.' + (res.error || 'invalid_credentials');
              var msg = t(key);
              err.textContent = msg === key ? t('auth.err.invalid_credentials') : msg;
              submit.disabled = false;
              return;
            }
            currentUser = res.user;
            sessionChecked = Promise.resolve({ user: currentUser });
            ov.remove();
            resolve(currentUser);
            emit('SIGNED_IN');
            syncFromCloud().then(pushAllUserData).catch(function () {});
          }).catch(function () {
            err.textContent = t('auth.err.network');
            submit.disabled = false;
          });
        });
      }
      render();
    });
  }

  function signOut() {
    return api('auth/logout', { method: 'POST' }).catch(function () {}).then(function () {
      currentUser = null; sessionChecked = null; lastSyncedHash = {};
      emit('SIGNED_OUT');
    });
  }

  function deleteUser() {
    if (!currentUser) return Promise.reject(new Error('Not authenticated'));
    return api('account', { method: 'DELETE' }).then(function () {
      currentUser = null; sessionChecked = null; lastSyncedHash = {};
      emit('SIGNED_OUT');
    });
  }

  function put(table, value) {
    if (!currentUser) return Promise.resolve({ skipped: true });
    var hash = JSON.stringify(value === undefined ? null : value);
    if (lastSyncedHash[table] === hash) return Promise.resolve({ skipped: true });
    return api('data/' + table, { method: 'PUT', body: value === undefined ? null : value }).then(function (r) {
      lastSyncedHash[table] = hash;
      return r;
    }).catch(function (e) {
      console.warn('[cloud] push "' + table + '" failed:', e.message || e);
      return { error: e };
    });
  }

  function pushTable(table) {
    var local = SL.store.get()[table];
    return put(table, Array.isArray(local) ? local : []);
  }

  function pullTable(table) {
    if (!currentUser) return Promise.resolve([]);
    return api('data/' + table).then(function (r) { return r.data || []; }).catch(function (e) {
      console.warn('[cloud] pull "' + table + '" failed:', e.message || e);
      return [];
    });
  }

  function pushAllUserData() {
    if (!currentUser) return Promise.resolve({ skipped: true });
    var st = SL.store.get();
    var profile = Object.assign({}, st.profile || {}, { email: currentUser.email });
    var jobs = LIST_TABLES.map(pushTable).concat([
      put('profiles', profile),
      put('academic_structures', st.academic || {}),
      put('standing_logs', st.standingLog || []),
      put('vault_entries', (st.vault && st.vault.entries) || []),
      put('app_settings', st.settings || {}),
    ]);
    return Promise.all(jobs).then(function (results) { return { ok: true, results: results }; });
  }

  function syncToCloud() { return pushAllUserData(); }

  function syncFromCloud() {
    if (!currentUser) return Promise.resolve({ skipped: true });
    var getDoc = function (key) {
      return api('data/' + key).then(function (r) { return r.data; }).catch(function () { return null; });
    };
    return Promise.all([
      Promise.all(LIST_TABLES.map(function (t) {
        return pullTable(t).then(function (rows) { return { table: t, rows: rows }; });
      })),
      getDoc('academic_structures'),
      getDoc('profiles'),
    ]).then(function (all) {
      var results = all[0];
      var cloudAcademic = all[1];
      var cloudProfile = all[2];
      var st = SL.store.get();
      var changed = false;
      results.forEach(function (r) {
        var local = st[r.table];
        if (!r.rows.length || !Array.isArray(local)) return;
        r.rows.forEach(function (crow) {
          var idx = local.findIndex(function (l) { return l.id === crow.id; });
          if (idx >= 0) local[idx] = crow; else local.push(crow);
          changed = true;
        });
      });
      // Adopt the cloud academic structure when this device has none yet
      if (cloudAcademic && Array.isArray(cloudAcademic.years) && cloudAcademic.years.length &&
          !(st.academic && st.academic.years && st.academic.years.length)) {
        st.academic = cloudAcademic;
        changed = true;
      }
      // Fill empty local profile fields from the cloud copy
      if (cloudProfile && st.profile) {
        Object.keys(cloudProfile).forEach(function (k) {
          if (k !== 'email' && cloudProfile[k] && !st.profile[k]) { st.profile[k] = cloudProfile[k]; changed = true; }
        });
      }
      SL.store.saveNow();
      if (changed && SL.store.emit) SL.store.emit();
      return { ok: true, tables: results.map(function (r) { return r.table + ':' + r.rows.length; }) };
    });
  }

  function init() {
    if (!ENABLED) return Promise.resolve({ disabled: true });
    return getSession().then(function (session) {
      if (!session) return { connected: false };
      return syncFromCloud().then(function () { return { connected: true, user: session.user }; });
    });
  }

  SL.supabase = SL.cloud = {
    ENABLED: ENABLED,
    isConnected: isConnected,
    getUser: getUser,
    getSession: getSession,
    onAuthChange: onAuthChange,
    signIn: signIn,
    signInWithGoogle: signIn, // legacy name used by existing callers
    signOut: signOut,
    deleteUser: deleteUser,
    pushTable: pushTable,
    pullTable: pullTable,
    syncToCloud: syncToCloud,
    syncFromCloud: syncFromCloud,
    pushAllUserData: pushAllUserData,
    init: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { if (SL.store && ENABLED) init(); });
  } else if (SL.store && ENABLED) {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
