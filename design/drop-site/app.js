/* iCube — long recording drop
 * ------------------------------------------------------------------
 * Uploads any-length audio in ~8 MB pieces so a 2-hour file (or a flaky
 * connection) is a non-event. Each piece lands in storage independently;
 * the session id is remembered locally so closing the tab and coming
 * back resumes the same file instead of starting over.
 * ------------------------------------------------------------------ */
(() => {
  'use strict';

  const SB = 'https://ijinvtizlocytljflbbr.supabase.co';
  const KEY = 'sb_publishable_6GKGuJDdaHNp1T5gjzAHEg_dlJvW1Jh';
  const REST = `${SB}/rest/v1`;
  const STORE = `${SB}/storage/v1/object`;
  const FN = `${SB}/functions/v1/drop-assemble`;

  const BUCKET = 'drop-audio';
  const CHUNK = 8 * 1024 * 1024; // 8 MB — comfortably under the 50 MB object cap
  const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB hard ceiling
  const LS_KEY = 'icube.drop.v1';
  const RETRIES = 4;

  const el = {
    form: document.getElementById('form'),
    name: document.getElementById('name'),
    file: document.getElementById('file'),
    dropzone: document.getElementById('dropzone'),
    chosen: document.getElementById('chosen'),
    fname: document.getElementById('fname'),
    fsize: document.getElementById('fsize'),
    dtxt: document.getElementById('dtxt'),
    dtxt2: document.getElementById('dtxt2'),
    resume: document.getElementById('resume'),
    resumeTxt: document.getElementById('resumeTxt'),
    prog: document.getElementById('prog'),
    pct: document.getElementById('pct'),
    pmeta: document.getElementById('pmeta'),
    pnote: document.getElementById('pnote'),
    chunks: document.getElementById('chunks'),
    topic: document.getElementById('topic'),
    notes: document.getElementById('notes'),
    bar: document.getElementById('bar'),
    submit: document.getElementById('submit'),
    submitLbl: document.getElementById('submitLbl'),
    okState: document.getElementById('okState'),
    okMsg: document.getElementById('okMsg'),
    errState: document.getElementById('errState'),
    errTitle: document.getElementById('errTitle'),
    errMsg: document.getElementById('errMsg'),
    again: document.getElementById('again'),
    retry: document.getElementById('retry'),
  };

  let picked = null;      // File
  let session = null;     // { id, total_parts, chunk, total_bytes }
  let sent = new Set();   // part numbers already stored
  let busy = false;

  /* ---------------- helpers ---------------- */

  const fmtBytes = (n) => {
    if (!n && n !== 0) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
  };

  const fmtDur = (s) => {
    if (!Number.isFinite(s) || s <= 0) return '';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m ${Math.round(s % 60)}s`;
  };

  const safeName = (name) => {
    const dot = name.lastIndexOf('.');
    const base = (dot > 0 ? name.slice(0, dot) : name)
      .normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 90) || 'recording';
    const ext = (dot > 0 ? name.slice(dot + 1) : '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return ext ? `${base}.${ext}` : base;
  };

  const uuid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : (() => {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    })());

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const api = (path, init = {}) =>
    fetch(`${REST}/${path}`, {
      ...init,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

  /* ---------------- local resume memory ---------------- */

  function remember(info) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(info)); } catch { /* private mode */ }
  }
  function recall() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  }
  function forget() {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  }

  /* ---------------- chunk strip ---------------- */

  function drawChunks(total) {
    el.chunks.innerHTML = '';
    const show = Math.min(total, 60); // keep the strip readable for 600-part files
    for (let i = 0; i < show; i++) el.chunks.appendChild(document.createElement('i'));
    el.chunks.dataset.total = show;
    el.chunks.dataset.real = total;
  }

  function paintChunks(doneCount, liveIndex) {
    const nodes = el.chunks.children;
    const real = Number(el.chunks.dataset.real || nodes.length);
    const ratio = real / Math.max(nodes.length, 1);
    for (let i = 0; i < nodes.length; i++) {
      const upto = Math.round((i + 1) * ratio);
      nodes[i].className =
        upto <= doneCount ? 'done'
          : (liveIndex !== undefined && Math.floor(liveIndex / ratio) === i) ? 'live'
            : '';
    }
  }

  /* ---------------- progress display ---------------- */

  function progress(done, total, label) {
    const pct = total ? Math.floor((done / total) * 100) : 0;
    el.pct.textContent = `${pct}%`;
    el.pmeta.textContent = label || `${done} of ${total} pieces`;
    el.bar.classList.add('on');
    el.bar.firstElementChild.style.width = `${pct}%`;
    paintChunks(done);
  }

  /* ---------------- picking a file ---------------- */

  async function choose(file) {
    if (!file) return;
    if (file.size === 0) return showError('That file is empty', 'It has no audio inside it. Pick another one.');
    if (file.size > MAX_BYTES) {
      return showError('That file is too big', `Even for this page it's over ${fmtBytes(MAX_BYTES)}. Split it in two and send each half.`);
    }

    picked = file;
    session = null;
    sent = new Set();
    hideStates();
    el.chosen.hidden = false;
    el.fname.textContent = file.name;
    el.dtxt.textContent = 'Recording selected';
    el.dtxt2.textContent = 'Tap above to swap it for a different file.';

    // try to show a duration — cheap for most formats, silent if unsupported
    let dur = 0;
    try {
      dur = await new Promise((resolve) => {
        const a = document.createElement('audio');
        const url = URL.createObjectURL(file);
        const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
        a.preload = 'metadata';
        a.onloadedmetadata = () => done(a.duration);
        a.onerror = () => done(0);
        setTimeout(() => done(0), 4000);
        a.src = url;
      });
    } catch { dur = 0; }

    const parts = Math.ceil(file.size / CHUNK);
    el.fsize.textContent = [fmtBytes(file.size), fmtDur(dur), `${parts} piece${parts > 1 ? 's' : ''}`]
      .filter(Boolean).join('  ·  ');

    // a previous attempt at this exact file can be resumed
    const prev = recall();
    if (prev && prev.name === file.name && prev.size === file.size) {
      try {
        const r = await api(`drop_sessions?session_id=eq.${prev.id}&select=session_id,total_parts,chunk_size,total_bytes,received&limit=1`);
        const rows = r.ok ? await r.json() : [];
        if (rows.length && !rows[0].received) {
          session = { id: prev.id, total_parts: rows[0].total_parts, total_bytes: rows[0].total_bytes };
          const st = await fetch(FN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: KEY },
            body: JSON.stringify({ session_id: session.id, action: 'status' }),
          }).then((x) => x.json()).catch(() => null);
          if (st && Array.isArray(st.parts)) {
            sent = new Set(st.parts.map((p) => p.part_no));
            if (sent.size) {
              el.resume.classList.add('on');
              el.resumeTxt.innerHTML =
                `<b>${sent.size} of ${session.total_parts} pieces</b> from your earlier attempt are already saved. ` +
                `Press send and it continues from there.`;
              drawChunks(session.total_parts);
              paintChunks(sent.size);
            }
          }
        } else {
          forget();
        }
      } catch { forget(); }
    }

    if (!session) {
      el.resume.classList.remove('on');
      el.prog.classList.remove('on');
      drawChunks(parts);
      paintChunks(0);
    }

    el.submit.disabled = false;
    el.submitLbl.textContent = sent.size ? 'Continue the upload' : 'Send the recording';
  }

  /* ---------------- starting a session ---------------- */

  async function startSession() {
    const id = uuid();
    const total_parts = Math.ceil(picked.size / CHUNK);
    const row = {
      session_id: id,
      file_name: safeName(picked.name),
      mime_type: picked.type || 'application/octet-stream',
      total_bytes: picked.size,
      chunk_size: CHUNK,
      total_parts,
      sender: el.name.value.trim() || null,
      topic: el.topic.value || null,
      notes: el.notes.value.trim() || null,
    };

    const r = await api('drop_sessions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 429 || /rate limit/i.test(t)) {
        const e = new Error('rate');
        e.code = 429;
        throw e;
      }
      throw new Error(`session ${r.status} ${t}`);
    }

    session = { id, total_parts, total_bytes: picked.size };
    remember({ id, name: picked.name, size: picked.size, at: Date.now() });
    drawChunks(total_parts);
    return session;
  }

  /* ---------------- uploading one piece ---------------- */

  async function putPart(index) {
    const start = index * CHUNK;
    const blob = picked.slice(start, Math.min(start + CHUNK, picked.size));
    const path = `inbox/${session.id}/${index}.part`;

    let lastErr;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      if (attempt) await sleep(Math.min(1200 * 2 ** (attempt - 1), 9000));
      try {
        // No upsert header on purpose: upsert makes Storage demand SELECT + UPDATE
        // rights on the object, and those are denied by design so nobody can read
        // another person's audio. A fresh path per retry keeps us on plain INSERT.
        const partPath = attempt ? `inbox/${session.id}/${index}.r${attempt}.part` : path;
        const r = await fetch(`${STORE}/${BUCKET}/${partPath}`, {
          method: 'POST',
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${KEY}`,
            'Content-Type': 'application/octet-stream',
          },
          body: blob,
        });
        // 409 = an identical earlier attempt already landed; that is success for us
        if (r.ok || r.status === 409) {
          if (attempt) await recordPart(index);
          return;
        }
        const t = await r.text().catch(() => '');
        lastErr = new Error(`part ${index}: ${r.status} ${t}`);
        if (r.status === 400 || r.status === 401) break;   // policy — retrying won't help
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error(`part ${index} failed`);
  }

  async function recordPart(index) {
    const bytes = Math.min((index + 1) * CHUNK, session.total_bytes) - index * CHUNK;
    const r = await api('drop_parts', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ session_id: session.id, part_no: index, bytes }),
    });
    if (!r.ok && r.status !== 409) {
      // Non-fatal: the assembled file is verified from storage, and a missing
      // bookkeeping row only affects resume accuracy, not the audio itself.
      console.warn('[drop] part row', index, r.status);
    }
  }

  /* ---------------- the whole upload ---------------- */

  async function upload() {
    busy = true;
    el.submit.classList.add('busy');
    el.submit.disabled = true;
    el.submitLbl.textContent = 'Uploading…';
    el.prog.classList.add('on');
    el.resume.classList.remove('on');
    hideStates();

    try {
      if (!session) {
        el.submitLbl.textContent = 'Opening the drop…';
        await startSession();
      }

      const total = session.total_parts;
      const queue = [];
      for (let i = 0; i < total; i++) if (!sent.has(i)) queue.push(i);

      progress(sent.size, total, sent.size ? `resuming · ${sent.size} already saved` : 'starting…');

      // Four at a time: enough to saturate a decent link without starving the
      // browser's connection pool on a phone.
      const LANES = 4;
      let cursor = 0;
      let done = sent.size;

      const lane = async () => {
        for (;;) {
          const my = cursor++;
          if (my >= queue.length) return;
          const index = queue[my];
          paintChunks(done, index);
          await putPart(index);
          await recordPart(index);
          sent.add(index);
          done++;
          progress(done, total, `${done} of ${total} pieces`);
        }
      };

      await Promise.all(Array.from({ length: Math.min(LANES, queue.length || 1) }, lane));

      // ---- stitch ----
      el.submitLbl.textContent = 'Joining the pieces…';
      el.pmeta.textContent = 'joiner working';
      const fin = await fetch(FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: KEY },
        body: JSON.stringify({ session_id: session.id, action: 'finalize' }),
      });
      const out = await fin.json().catch(() => ({}));

      if (out && out.done) {
        forget();
        el.bar.firstElementChild.style.width = '100%';
        el.pct.textContent = '100%';
        el.pmeta.textContent = 'complete';
        paintChunks(total);
        el.okMsg.textContent =
          `${out.file_name} — ${fmtBytes(out.bytes)} — arrived whole and saved as one file. I'll listen through and come back to you.`;
        showSuccess();
        return;
      }
      if (out && out.error === 'incomplete') {
        const e = new Error('incomplete');
        e.code = 409;
        throw e;
      }
      throw new Error(out.error ? `${out.error} ${out.detail || ''}` : 'finalize failed');
    } catch (err) {
      console.error('[drop]', err);
      if (err.code === 429) {
        showError('Too many uploads just now', 'This link allows a handful of new recordings an hour. Wait a little, then press send — everything already uploaded is kept.');
      } else if (err.code === 409) {
        showError('A few pieces are still missing', 'Press continue — it will re-send only the gaps and join the file.');
      } else {
        showError('That didn\'t finish', 'The upload stopped partway. Nothing is lost — press continue and it picks up from the last piece that landed.');
      }
    } finally {
      busy = false;
      el.submit.classList.remove('busy');
      el.submit.disabled = !picked;
      el.submitLbl.textContent = sent.size ? 'Continue the upload' : 'Send the recording';
    }
  }

  /* ---------------- states ---------------- */

  function hideStates() {
    el.okState.classList.remove('show');
    el.errState.classList.remove('show');
    el.form.style.display = '';
  }
  function showSuccess() {
    el.form.style.display = 'none';
    el.errState.classList.remove('show');
    el.okState.classList.add('show');
  }
  function showError(title, msg) {
    el.errTitle.textContent = title;
    el.errMsg.textContent = msg;
    el.okState.classList.remove('show');
    el.errState.classList.add('show');
  }

  /* ---------------- events ---------------- */

  el.file.addEventListener('change', () => choose(el.file.files[0]));

  // drag and drop
  ['dragenter', 'dragover'].forEach((ev) =>
    el.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      el.dropzone.classList.add('over');
    }));
  ['dragleave', 'drop'].forEach((ev) =>
    el.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      el.dropzone.classList.remove('over');
    }));
  el.dropzone.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) choose(f);
  });
  // dropping anywhere on the card also works
  el.form.addEventListener('dragover', (e) => e.preventDefault());
  el.form.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) choose(f);
  });

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy || !picked) return;
    upload();
  });

  el.retry.addEventListener('click', () => {
    el.errState.classList.remove('show');
    upload();
  });

  el.again.addEventListener('click', () => {
    picked = null; session = null; sent = new Set();
    forget();
    el.file.value = '';
    el.chosen.hidden = true;
    el.resume.classList.remove('on');
    el.prog.classList.remove('on');
    el.bar.classList.remove('on');
    el.bar.firstElementChild.style.width = '0%';
    el.chunks.innerHTML = '';
    el.dtxt.textContent = 'Tap to choose a file';
    el.dtxt2.textContent = 'or drag it in here. Any length — a two-hour meeting recording is fine.';
    el.submit.disabled = true;
    el.submitLbl.textContent = 'Send the recording';
    hideStates();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Warn before leaving mid-upload — the resume path works, but a nudge is kinder.
  window.addEventListener('beforeunload', (e) => {
    if (busy) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
