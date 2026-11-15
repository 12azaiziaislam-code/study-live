/* ============================================================
   Study Live — select.js
   Replaces every native <select> with a styled dropdown while
   keeping the real <select> in the DOM (value, change events and
   form logic keep working unchanged).
   ============================================================ */
(function (root) {
  'use strict';

  var CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  var CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  var openState = null; // { sel, pop, btn, idx }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }

  function colorFor(value) {
    try {
      var s = value && root.SL && SL.store && SL.store.subjectById && SL.store.subjectById(value);
      return s && s.color ? s.color : null;
    } catch (e) { return null; }
  }

  function optionHTML(opt) {
    var c = colorFor(opt.value);
    var dot = c ? '<span class="cs-dot" style="background:' + esc(c) + '"></span>'
      : (opt.value === '' ? '<span class="cs-dot cs-dot-none"></span>' : '');
    return dot + '<span class="cs-text">' + esc(opt.textContent) + '</span>';
  }

  function refresh(sel) {
    var btn = sel._csBtn;
    if (!btn) return;
    var opt = sel.options[sel.selectedIndex];
    btn.querySelector('.cs-value').innerHTML = opt ? optionHTML(opt) : '';
    btn.disabled = sel.disabled;
  }

  function close(focusBtn) {
    if (!openState) return;
    var st = openState;
    openState = null;
    st.pop.classList.remove('open');
    st.btn.setAttribute('aria-expanded', 'false');
    st.btn.classList.remove('open');
    setTimeout(function () { st.pop.remove(); }, 160);
    if (focusBtn) st.btn.focus();
  }

  function choose(sel, i) {
    if (i < 0 || i >= sel.options.length || sel.options[i].disabled) return;
    var changed = sel.selectedIndex !== i;
    sel.selectedIndex = i;
    refresh(sel);
    if (changed) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function highlight(i) {
    if (!openState) return;
    var items = openState.pop.querySelectorAll('.cs-opt');
    if (!items.length) return;
    i = Math.max(0, Math.min(items.length - 1, i));
    openState.idx = i;
    items.forEach(function (el, k) { el.classList.toggle('active', k === i); });
    items[i].scrollIntoView({ block: 'nearest' });
  }

  function position(btn, pop) {
    var r = btn.getBoundingClientRect();
    var vh = root.innerHeight;
    var below = vh - r.bottom - 12;
    var above = r.top - 12;
    var maxH = Math.min(340, Math.max(below, above));
    pop.style.minWidth = r.width + 'px';
    pop.style.maxWidth = Math.max(r.width, Math.min(460, root.innerWidth - 24)) + 'px';
    pop.style.maxHeight = maxH + 'px';
    var left = Math.min(r.left, root.innerWidth - pop.offsetWidth - 12);
    pop.style.left = Math.max(12, left) + 'px';
    if (below >= Math.min(pop.scrollHeight, 220) || below >= above) {
      pop.style.top = (r.bottom + 6) + 'px';
      pop.style.bottom = '';
      pop.classList.remove('up');
    } else {
      pop.style.top = '';
      pop.style.bottom = (vh - r.top + 6) + 'px';
      pop.classList.add('up');
    }
  }

  function open(sel) {
    if (openState && openState.sel === sel) { close(true); return; }
    close();
    var btn = sel._csBtn;
    var pop = document.createElement('div');
    pop.className = 'cs-pop';
    pop.setAttribute('role', 'listbox');
    var html = '';
    for (var i = 0; i < sel.options.length; i++) {
      var o = sel.options[i];
      html += '<div class="cs-opt' + (i === sel.selectedIndex ? ' selected' : '') + (o.disabled ? ' disabled' : '') +
        '" role="option" data-i="' + i + '" aria-selected="' + (i === sel.selectedIndex) + '">' +
        optionHTML(o) + '<span class="cs-check">' + CHECK + '</span></div>';
    }
    pop.innerHTML = html;
    document.body.appendChild(pop);
    position(btn, pop);
    openState = { sel: sel, pop: pop, btn: btn, idx: sel.selectedIndex };
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('open');
    requestAnimationFrame(function () { pop.classList.add('open'); });
    highlight(Math.max(0, sel.selectedIndex));

    pop.addEventListener('mousedown', function (e) { e.preventDefault(); });
    pop.addEventListener('click', function (e) {
      var item = e.target.closest('.cs-opt');
      if (!item || item.classList.contains('disabled')) return;
      choose(sel, +item.getAttribute('data-i'));
      close(true);
    });
    pop.addEventListener('mousemove', function (e) {
      var item = e.target.closest('.cs-opt');
      if (item && openState) highlight(+item.getAttribute('data-i'));
    });
  }

  function enhance(sel) {
    if (sel._csBtn || sel.multiple || sel.hasAttribute('data-native')) return;
    var wrap = document.createElement('div');
    wrap.className = 'cs-wrap';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('cs-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="cs-value"></span><span class="cs-chev">' + CHEVRON + '</span>';
    wrap.appendChild(btn);
    sel._csBtn = btn;
    refresh(sel);

    btn.addEventListener('click', function () { open(sel); });
    btn.addEventListener('keydown', function (e) {
      var isOpen = openState && openState.sel === sel;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) { open(sel); return; }
        highlight(openState.idx + (e.key === 'ArrowDown' ? 1 : -1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!isOpen) { open(sel); return; }
        choose(sel, openState.idx);
        close(true);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      } else if (e.key === 'Tab' && isOpen) {
        close();
      }
    });
    sel.addEventListener('change', function () { refresh(sel); });

    // Keep label in sync when options are rebuilt
    new MutationObserver(function () { refresh(sel); }).observe(sel, { childList: true, subtree: true, characterData: true });
  }

  // Keep the button in sync with programmatic `select.value = ...`
  ['value', 'selectedIndex'].forEach(function (prop) {
    var d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
    if (!d || !d.set) return;
    Object.defineProperty(HTMLSelectElement.prototype, prop, {
      configurable: true,
      enumerable: d.enumerable,
      get: d.get,
      set: function (v) { d.set.call(this, v); if (this._csBtn) refresh(this); },
    });
  });

  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'SELECT') enhance(node);
    else node.querySelectorAll && node.querySelectorAll('select').forEach(enhance);
  }

  function start() {
    scan(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { m.addedNodes.forEach(scan); });
      if (openState && !document.body.contains(openState.btn)) close();
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('mousedown', function (e) {
      if (openState && !openState.pop.contains(e.target) && !openState.btn.contains(e.target)) close();
    }, true);
    root.addEventListener('resize', function () { close(); });
    document.addEventListener('scroll', function (e) {
      if (openState && !openState.pop.contains(e.target)) close();
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
