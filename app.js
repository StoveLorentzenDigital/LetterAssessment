/* Letter Check — classroom letter-comprehension tracker.
   Data lives in localStorage; no network, no accounts. */
(() => {
  'use strict';

  const STORAGE_KEY = 'letter-check.v1';
  const APP_VERSION = '1.2.0';
  const MAX_STUDENTS = 100;   // hard cap; never surfaced in the UI
  const FILL_COUNT = 20;      // what "Fill roster" seeds, for a typical class
  const MAX_NUMBER = 9999;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const CATS = [
    { key: 'u', label: 'Uppercase' },
    { key: 'l', label: 'Lowercase' },
    { key: 's', label: 'Sound' }
  ];
  const PER_STUDENT = LETTERS.length * CATS.length; // 78

  const SPEAKER_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5a1 1 0 0 0 1 1h3l4.3 3.6a.8.8 0 0 0 1.3-.6V5.5a.8.8 0 0 0-1.3-.6L8 8.5H5a1 1 0 0 0-1 1Zm13.4-3a1 1 0 0 0-.2 1.4 6 6 0 0 1 0 6.2 1 1 0 1 0 1.6 1.2 8 8 0 0 0 0-8.6 1 1 0 0 0-1.4-.2Zm-2.7 2.9a1 1 0 0 0-.3 1.4 2.5 2.5 0 0 1 0 2.4 1 1 0 0 0 1.7 1 4.5 4.5 0 0 0 0-4.4 1 1 0 0 0-1.4-.4Z"/></svg>';

  const GRIP_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="4" r="1.35"/><circle cx="10" cy="4" r="1.35"/><circle cx="6" cy="8" r="1.35"/><circle cx="10" cy="8" r="1.35"/><circle cx="6" cy="12" r="1.35"/><circle cx="10" cy="12" r="1.35"/></svg>';

  /* ── State ──────────────────────────────────────────────── */

  let state = load();
  let undoStack = [];
  let deferredInstall = null;

  function blankState() {
    return { version: 1, students: [], activeId: null, letter: 'A', view: 'student' };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      const parsed = JSON.parse(raw);
      return normalize(parsed);
    } catch (err) {
      console.warn('Could not read saved data', err);
      return blankState();
    }
  }

  function normalize(data) {
    const s = blankState();
    if (!data || typeof data !== 'object') return s;
    if (Array.isArray(data.students)) {
      // Names are deliberately not read back, even from an older backup that
      // carried them: this app tracks students by number only.
      s.students = data.students.slice(0, MAX_STUDENTS).map((st, i) => ({
        id: typeof st.id === 'string' ? st.id : newId(),
        num: cleanNumber(st.num, i + 1),
        marks: cleanMarks(st.marks)
      }));
    }
    s.activeId = s.students.some(st => st.id === data.activeId) ? data.activeId : (s.students[0] ? s.students[0].id : null);
    s.letter = LETTERS.includes(data.letter) ? data.letter : 'A';
    s.view = ['student', 'letter', 'overview'].includes(data.view) ? data.view : 'student';
    return s;
  }

  function cleanNumber(value, fallback) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= MAX_NUMBER ? n : fallback;
  }

  function cleanMarks(marks) {
    const out = {};
    if (!marks || typeof marks !== 'object') return out;
    for (const letter of LETTERS) {
      const m = marks[letter];
      if (!m) continue;
      const kept = {};
      for (const { key } of CATS) if (m[key]) kept[key] = true;
      if (Object.keys(kept).length) out[letter] = kept;
    }
    return out;
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        toast('Could not save — device storage is full or blocked.');
        console.error(err);
      }
    }, 120);
  }

  function newId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ── Data helpers ───────────────────────────────────────── */

  const byId = id => state.students.find(s => s.id === id) || null;
  const label = student => `Student ${student.num}`;

  // Lowest number not already on the roster, so removing #3 frees it again.
  function nextNumber() {
    const taken = new Set(state.students.map(s => s.num));
    let n = 1;
    while (taken.has(n) && n < MAX_NUMBER) n++;
    return n;
  }

  const activeStudent = () => byId(state.activeId);
  const isOn = (student, letter, cat) => !!(student && student.marks[letter] && student.marks[letter][cat]);

  function setMark(student, letter, cat, value) {
    if (!student) return;
    const m = student.marks[letter] || (student.marks[letter] = {});
    if (value) m[cat] = true;
    else delete m[cat];
    if (!Object.keys(m).length) delete student.marks[letter];
    save();
  }

  function studentTotals(student) {
    const t = { u: 0, l: 0, s: 0, all: 0 };
    for (const letter of LETTERS) {
      const m = student.marks[letter];
      if (!m) continue;
      for (const { key } of CATS) if (m[key]) { t[key]++; t.all++; }
    }
    return t;
  }

  function letterTotals(letter) {
    const t = { u: 0, l: 0, s: 0, all: 0 };
    for (const student of state.students) {
      const m = student.marks[letter];
      if (!m) continue;
      for (const { key } of CATS) if (m[key]) { t[key]++; t.all++; }
    }
    return t;
  }

  /* ── DOM shortcuts ──────────────────────────────────────── */

  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = str => String(str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const views = {
    student: $('#view-student'),
    letter: $('#view-letter'),
    overview: $('#view-overview')
  };

  /* ── Rendering ──────────────────────────────────────────── */

  function render() {
    for (const [name, node] of Object.entries(views)) node.hidden = name !== state.view;
    document.querySelectorAll('.tab').forEach(tab => {
      tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
    });
    $('#undoBtn').disabled = undoStack.length === 0;

    if (state.view === 'student') renderStudentView();
    else if (state.view === 'letter') renderLetterView();
    else renderOverview();
  }

  function statTile(cls, label, value, max) {
    const pct = max ? Math.round((value / max) * 100) : 0;
    return `<div class="stat ${cls}">
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value">${value}<small> / ${max}</small></div>
      <div class="meter"><i style="width:${pct}%"></i></div>
    </div>`;
  }

  function toggleButton(cat, letter, on) {
    const face = cat.key === 'u' ? letter : cat.key === 'l' ? letter.toLowerCase() : SPEAKER_SVG;
    return `<button class="tog ${cat.key}" data-cat="${cat.key}" aria-pressed="${on}"
      aria-label="${esc(cat.label)} ${esc(letter)}">${face}</button>`;
  }

  /* — By student — */
  function renderStudentView() {
    const select = $('#studentSelect');
    select.innerHTML = state.students.length
      ? state.students.map(s => `<option value="${s.id}"${s.id === state.activeId ? ' selected' : ''}>${label(s)}</option>`).join('')
      : '<option>No students yet</option>';
    select.disabled = !state.students.length;

    const idx = state.students.findIndex(s => s.id === state.activeId);
    $('#prevStudent').disabled = idx <= 0;
    $('#nextStudent').disabled = idx < 0 || idx >= state.students.length - 1;

    const student = activeStudent();
    const rows = $('#studentRows');

    if (!student) {
      $('#studentScore').innerHTML = '';
      rows.innerHTML = '<p class="empty">Add students under <strong>Manage</strong> (top right) to start assessing.</p>';
      return;
    }

    const t = studentTotals(student);
    $('#studentScore').innerHTML =
      statTile('total', 'Mastered', t.all, PER_STUDENT) +
      CATS.map(c => statTile(c.key, c.label, t[c.key], LETTERS.length)).join('');

    rows.innerHTML = LETTERS.map(letter => {
      const on = CATS.map(c => isOn(student, letter, c.key));
      return `<div class="row${on.every(Boolean) ? ' complete' : ''}" data-letter="${letter}">
        <div class="gutter">${letter}</div>
        ${CATS.map((c, i) => toggleButton(c, letter, on[i])).join('')}
      </div>`;
    }).join('');
  }

  /* — By letter — */
  function renderLetterView() {
    $('#alphabetStrip').innerHTML = LETTERS.map(letter => {
      const t = letterTotals(letter);
      const n = state.students.length;
      const dots = CATS.map(c => `<i class="${c.key}${n && t[c.key] === n ? ' on' : ''}"></i>`).join('');
      return `<button class="alpha" data-letter="${letter}" aria-pressed="${letter === state.letter}"
        aria-label="Letter ${letter}">${letter}<span class="dots" aria-hidden="true">${dots}</span></button>`;
    }).join('');

    const n = state.students.length;
    const t = letterTotals(state.letter);
    $('#letterScore').innerHTML =
      statTile('total', `Letter ${state.letter}`, t.all, n * CATS.length) +
      CATS.map(c => statTile(c.key, c.label, t[c.key], n)).join('');

    const rows = $('#letterRows');
    if (!n) {
      rows.innerHTML = '<p class="empty">Add students under <strong>Manage</strong> (top right) to start assessing.</p>';
      return;
    }

    rows.innerHTML = state.students.map(student => {
      const on = CATS.map(c => isOn(student, state.letter, c.key));
      return `<div class="row${on.every(Boolean) ? ' complete' : ''}" data-student="${student.id}">
        <div class="gutter num">${student.num}</div>
        ${CATS.map((c, i) => toggleButton(c, state.letter, on[i])).join('')}
      </div>`;
    }).join('');
  }

  /* — Overview — */
  function renderOverview() {
    const students = state.students;
    const summary = $('#overviewSummary');
    const table = $('#matrix');

    if (!students.length) {
      summary.innerHTML = '';
      table.innerHTML = '<tbody><tr><td class="empty" style="padding:16px">Add students under <strong>Manage</strong> (top right) to start assessing.</td></tr></tbody>';
      return;
    }

    const classMax = students.length * LETTERS.length;
    const totals = students.reduce((acc, s) => {
      const t = studentTotals(s);
      CATS.forEach(c => { acc[c.key] += t[c.key]; });
      acc.all += t.all;
      return acc;
    }, { u: 0, l: 0, s: 0, all: 0 });

    summary.innerHTML =
      statTile('total', 'Class mastered', totals.all, classMax * CATS.length) +
      CATS.map(c => statTile(c.key, c.label, totals[c.key], classMax)).join('');

    const head = `<thead><tr><th class="numcol">Student</th>${
      LETTERS.map(l => `<th>${l}</th>`).join('')}<th class="pct">%</th></tr></thead>`;

    const body = `<tbody>${students.map(s => {
      const t = studentTotals(s);
      const cells = LETTERS.map(letter => `<td><div class="cell">${
        CATS.map(c => `<i class="${c.key}${isOn(s, letter, c.key) ? ' on' : ''}"></i>`).join('')
      }</div></td>`).join('');
      return `<tr><th class="numcol"><button class="numbtn" data-open="${s.id}" aria-label="Open ${label(s)}">${s.num}</button></th>${cells}<td class="pct">${Math.round((t.all / PER_STUDENT) * 100)}%</td></tr>`;
    }).join('')}</tbody>`;

    const foot = `<tfoot><tr><th class="numcol">Class %</th>${
      LETTERS.map(l => {
        const t = letterTotals(l);
        return `<td>${Math.round((t.all / (students.length * CATS.length)) * 100)}</td>`;
      }).join('')}<td class="pct">${Math.round((totals.all / (classMax * CATS.length)) * 100)}%</td></tr></tfoot>`;

    table.innerHTML = head + body + foot;
  }

  /* ── Toggling ───────────────────────────────────────────── */

  function handleToggle(button, student, letter) {
    const cat = button.dataset.cat;
    const next = button.getAttribute('aria-pressed') !== 'true';

    undoStack.push({ id: student.id, letter, cat, prev: !next });
    if (undoStack.length > 100) undoStack.shift();

    setMark(student, letter, cat, next);
    button.setAttribute('aria-pressed', String(next));

    const row = button.closest('.row');
    row.classList.toggle('complete', CATS.every(c => isOn(student, letter, c.key)));
    $('#undoBtn').disabled = false;

    if (state.view === 'student') {
      const t = studentTotals(student);
      updateStats($('#studentScore'), [t.all, t.u, t.l, t.s], [PER_STUDENT, 26, 26, 26]);
    } else {
      const n = state.students.length;
      const t = letterTotals(letter);
      updateStats($('#letterScore'), [t.all, t.u, t.l, t.s], [n * 3, n, n, n]);
      updateAlphaDots(letter);
    }
    if (navigator.vibrate) navigator.vibrate(next ? 12 : 6);
  }

  function updateStats(container, values, maxes) {
    container.querySelectorAll('.stat').forEach((stat, i) => {
      stat.querySelector('.stat-value').innerHTML = `${values[i]}<small> / ${maxes[i]}</small>`;
      stat.querySelector('.meter i').style.width = (maxes[i] ? (values[i] / maxes[i]) * 100 : 0) + '%';
    });
  }

  function updateAlphaDots(letter) {
    const btn = $(`.alpha[data-letter="${letter}"]`);
    if (!btn) return;
    const t = letterTotals(letter);
    const n = state.students.length;
    btn.querySelectorAll('.dots i').forEach((dot, i) => {
      dot.classList.toggle('on', n > 0 && t[CATS[i].key] === n);
    });
  }

  $('#studentRows').addEventListener('click', e => {
    const button = e.target.closest('.tog');
    if (!button) return;
    const student = activeStudent();
    if (student) handleToggle(button, student, button.closest('.row').dataset.letter);
  });

  $('#letterRows').addEventListener('click', e => {
    const button = e.target.closest('.tog');
    if (!button) return;
    const student = byId(button.closest('.row').dataset.student);
    if (student) handleToggle(button, student, state.letter);
  });

  $('#alphabetStrip').addEventListener('click', e => {
    const button = e.target.closest('.alpha');
    if (!button) return;
    state.letter = button.dataset.letter;
    save();
    renderLetterView();
  });

  $('#matrix').addEventListener('click', e => {
    const button = e.target.closest('[data-open]');
    if (!button) return;
    state.activeId = button.dataset.open;
    state.view = 'student';
    save();
    render();
    window.scrollTo(0, 0);
  });

  /* ── Navigation ─────────────────────────────────────────── */

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.view = tab.dataset.view;
      save();
      render();
    });
  });

  $('#studentSelect').addEventListener('change', e => {
    state.activeId = e.target.value;
    save();
    renderStudentView();
  });

  const stepStudent = delta => {
    const idx = state.students.findIndex(s => s.id === state.activeId);
    const next = state.students[idx + delta];
    if (!next) return;
    state.activeId = next.id;
    save();
    renderStudentView();
    window.scrollTo(0, 0);
  };
  $('#prevStudent').addEventListener('click', () => stepStudent(-1));
  $('#nextStudent').addEventListener('click', () => stepStudent(1));

  $('#undoBtn').addEventListener('click', () => {
    const last = undoStack.pop();
    if (!last) return;
    const student = byId(last.id);
    if (student) {
      setMark(student, last.letter, last.cat, last.prev);
      const catLabel = CATS.find(c => c.key === last.cat).label.toLowerCase();
      toast(`Undid ${label(student)} — ${last.letter} ${catLabel}`);
    }
    render();
  });

  /* ── Manage sheet ───────────────────────────────────────── */

  const sheet = $('#sheet');
  const openSheet = () => {
    sheet.hidden = false;
    // Manage opens on the headcount alone; an empty roster is the exception,
    // since there the Add button is the only thing worth showing.
    $('#studentsFold').open = !state.students.length;
    renderRoster();
  };
  const closeSheet = () => { sheet.hidden = true; render(); };

  $('#menuBtn').addEventListener('click', openSheet);
  sheet.addEventListener('click', e => { if (e.target.hasAttribute('data-close')) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

  function renderRoster() {
    const list = $('#roster');
    const count = state.students.length;
    $('#rosterCount').textContent = String(count);

    // Fill roster leaves the row entirely once it would be a no-op, rather than
    // sitting there greyed out.
    $('#addRow').innerHTML =
      `<button class="btn primary" id="addStudent" type="button"${count >= MAX_STUDENTS ? ' disabled' : ''}>Add student</button>` +
      (count < FILL_COUNT ? '<button class="btn" id="fillRoster" type="button">Fill roster</button>' : '');

    if (!count) {
      list.innerHTML = `<li class="empty" style="display:block">No students yet. Add them one at a time, or fill the roster with ${FILL_COUNT} numbered slots.</li>`;
      return;
    }

    // One student has nothing to reorder against, so no handle is drawn.
    list.innerHTML = state.students.map(s => `<li data-id="${s.id}">
      ${count > 1 ? `<button class="drag" data-drag type="button" aria-label="Reorder Student ${s.num}"
        title="Drag to reorder, or focus and use the arrow keys">${GRIP_SVG}</button>` : ''}
      <span class="rosterfield">
        <span class="rosterlabel">Student</span>
        <input class="input num" type="number" inputmode="numeric" min="1" max="${MAX_NUMBER}"
          value="${s.num}" aria-label="Student number">
      </span>
      <button class="mini del" data-del title="Remove student">&#10005;</button>
    </li>`).join('');
  }

  // Committed on change rather than on every keystroke: mid-edit the field can
  // be empty or hold a number that is briefly out of range.
  $('#roster').addEventListener('change', e => {
    if (!e.target.classList.contains('num')) return;
    const student = byId(e.target.closest('li').dataset.id);
    if (!student) return;
    const next = cleanNumber(e.target.value, student.num);
    if (next !== student.num && state.students.some(s => s.num === next)) {
      toast(`Student ${next} is already on the roster.`);
    } else {
      student.num = next;
      save();
    }
    e.target.value = student.num;
  });

  $('#roster').addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const idx = state.students.findIndex(s => s.id === li.dataset.id);
    if (idx < 0) return;

    if (e.target.hasAttribute('data-del')) {
      const student = state.students[idx];
      const marked = studentTotals(student).all;
      if (marked && !confirm(`Remove ${label(student)}? ${marked} recorded mark${marked === 1 ? '' : 's'} will be deleted.`)) return;
      state.students.splice(idx, 1);
      if (state.activeId === student.id) state.activeId = state.students[0] ? state.students[0].id : null;
      undoStack = undoStack.filter(entry => entry.id !== student.id);
      save();
      renderRoster();
    }
  });

  /* — Reordering — */

  function moveStudent(id, delta) {
    const idx = state.students.findIndex(s => s.id === id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= state.students.length) return false;
    const [student] = state.students.splice(idx, 1);
    state.students.splice(target, 0, student);
    return true;
  }

  // Pointer events rather than HTML5 drag-and-drop, which never fires for touch
  // on iPadOS — the device this app is actually used on. The row is reinserted
  // in the list as the pointer crosses its neighbours, so the list itself is the
  // preview and there is no drag ghost to keep in sync.
  let dragging = null;

  function onDragMove(e) {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const list = $('#roster');
    const li = dragging.li;
    let before = null;
    for (const node of list.children) {
      if (node === li) continue;
      const box = node.getBoundingClientRect();
      if (e.clientY < box.top + box.height / 2) { before = node; break; }
    }
    if (li.nextElementSibling !== before) list.insertBefore(li, before);
  }

  function endDrag() {
    if (!dragging) return;
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
    dragging.li.classList.remove('dragging');
    dragging = null;
    const order = [...$('#roster').children].map(node => node.dataset.id);
    state.students.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    save();
    renderRoster();
  }

  $('#roster').addEventListener('pointerdown', e => {
    const handle = e.target.closest('[data-drag]');
    if (!handle || dragging || state.students.length < 2) return;
    e.preventDefault();
    dragging = { li: handle.closest('li'), pointerId: e.pointerId };
    dragging.li.classList.add('dragging');
    // Capture keeps events coming if the finger strays off the row; the
    // document-level listeners cover the case where it is refused, and also
    // catch a pointer released outside the sheet.
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
  });

  // The handle is focusable, so the arrow keys still reorder for anyone not
  // dragging with a pointer.
  $('#roster').addEventListener('keydown', e => {
    const handle = e.target.closest('[data-drag]');
    if (!handle) return;
    const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!delta) return;
    e.preventDefault();
    const id = handle.closest('li').dataset.id;
    if (!moveStudent(id, delta)) return;
    save();
    renderRoster();
    const moved = $(`#roster li[data-id="${id}"] [data-drag]`);
    if (moved) moved.focus();
  });

  function addStudent() {
    const student = { id: newId(), num: nextNumber(), marks: {} };
    state.students.push(student);
    if (!state.activeId) state.activeId = student.id;
    return student;
  }

  $('#addRow').addEventListener('click', e => {
    if (e.target.id === 'addStudent') {
      if (state.students.length >= MAX_STUDENTS) { toast('Roster is full.'); return; }
      addStudent();
    } else if (e.target.id === 'fillRoster') {
      if (state.students.length >= FILL_COUNT) return;
      while (state.students.length < FILL_COUNT) addStudent();
    } else {
      return;
    }
    save();
    renderRoster();
  });

  /* ── Import / export ────────────────────────────────────── */

  function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // Download is always the default: on desktop the OS share sheet is a dead end
  // (its Copy does not put file contents on the clipboard, and it offers no
  // "save to this device"). Sharing is offered separately, where it earns its
  // place — handing a backup to AirDrop or Mail from a tablet.
  function downloadFile(filename, mime, text) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Saved ${filename}`);
  }

  function makeFile(filename, mime, text) {
    try {
      return new File([text], filename, { type: mime });
    } catch (err) {
      return null; // older browsers without the File constructor
    }
  }

  function canShareFiles(file) {
    return !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  }

  async function shareFile(filename, mime, text) {
    const file = makeFile(filename, mime, text);
    if (!canShareFiles(file)) return downloadFile(filename, mime, text);
    try {
      await navigator.share({ files: [file], title: filename });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      downloadFile(filename, mime, text);
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied — paste into a spreadsheet.');
      return;
    } catch (err) {
      // Falls through: the async clipboard needs a secure context (https or
      // localhost), so a plain-http classroom server lands here.
    }
    const area = el('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    area.remove();
    toast(ok ? 'Copied — paste into a spreadsheet.' : 'Copying was blocked — use Download CSV instead.');
  }

  // Tab-separated for the clipboard (pastes straight into spreadsheet columns),
  // comma-separated for the .csv file.
  function toTable(sep) {
    const cell = v => (new RegExp(`["\n${sep === '\t' ? '\t' : ','}]`).test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const header = ['Student number']
      .concat(...LETTERS.map(l => CATS.map(c => `${l} ${c.label.toLowerCase()}`)))
      .concat(['Uppercase total', 'Lowercase total', 'Sound total', 'Overall total', 'Overall %']);
    const rows = state.students.map(s => {
      const t = studentTotals(s);
      return [String(s.num)]
        .concat(...LETTERS.map(l => CATS.map(c => (isOn(s, l, c.key) ? '1' : '0'))))
        .concat([t.u, t.l, t.s, t.all, Math.round((t.all / PER_STUDENT) * 100) + '%'].map(String));
    });
    return [header, ...rows].map(r => r.map(cell).join(sep)).join('\r\n');
  }

  // Leading BOM so Excel opens the file as UTF-8.
  const csvText = () => '\ufeff' + toTable(',');
  const csvName = () => `letter-check-${stamp()}.csv`;
  const backupText = () => JSON.stringify(
    { app: 'letter-check', version: 1, exported: new Date().toISOString(), students: state.students }, null, 2);
  const backupName = () => `letter-check-backup-${stamp()}.json`;

  const needStudents = () => {
    if (state.students.length) return true;
    toast('Nothing to export yet.');
    return false;
  };

  $('#downloadCsv').addEventListener('click', () => {
    if (needStudents()) downloadFile(csvName(), 'text/csv', csvText());
  });

  $('#copyCsv').addEventListener('click', () => {
    if (needStudents()) copyToClipboard(toTable('\t'));
  });

  $('#downloadJson').addEventListener('click', () => {
    downloadFile(backupName(), 'application/json', backupText());
  });

  $('#shareCsv').addEventListener('click', () => {
    if (needStudents()) shareFile(csvName(), 'text/csv', csvText());
  });

  $('#shareJson').addEventListener('click', () => {
    shareFile(backupName(), 'application/json', backupText());
  });

  $('#importBtn').addEventListener('click', () => $('#importFile').click());

  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.students)) throw new Error('Not a Letter Check backup');
      if (!confirm(`Restore ${parsed.students.length} student(s)? This replaces everything currently on this device.`)) return;
      state = normalize(parsed);
      undoStack = [];
      save();
      renderRoster();
      render();
      toast('Backup restored.');
    } catch (err) {
      console.error(err);
      toast("That file isn't a Letter Check backup.");
    }
  });

  $('#clearMarks').addEventListener('click', () => {
    if (!confirm('Clear every mark for all students? The roster stays; all checks are erased.')) return;
    state.students.forEach(s => { s.marks = {}; });
    undoStack = [];
    save();
    renderRoster();
    toast('All marks cleared.');
  });

  /* ── Install prompt ─────────────────────────────────────── */

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    if ($('#installBtn')) return;
    const row = el('div', 'btnrow');
    const btn = el('button', 'btn primary', 'Install app on this device');
    btn.id = 'installBtn';
    btn.addEventListener('click', async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      row.remove();
    });
    row.appendChild(btn);
    $('.sheet-body').prepend(row);
  });

  /* ── Toast ──────────────────────────────────────────────── */

  let toastTimer = null;
  function toast(message) {
    const node = $('#toast');
    node.innerHTML = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
  }

  /* ── Boot ───────────────────────────────────────────────── */

  // Sharing only appears where the device can genuinely share a file.
  $('#shareRow').hidden = !canShareFiles(makeFile('probe.txt', 'text/plain', 'x'));

  $('#versionLine').textContent = `Letter Check ${APP_VERSION} — works offline, stored on this device.`;

  // Write the normalized state back at startup rather than waiting for the first
  // edit: a roster saved by 1.0.x still holds student names, and this clears them
  // out of localStorage as soon as the app opens.
  save();

  // An empty roster deliberately does NOT pop the Manage sheet open: a first-run
  // wall of controls is more overwhelming than the empty assessment view, which
  // shows the shape of the app and points at Manage when they are ready.
  render();

  if (navigator.serviceWorker) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
    });
  }
})();
