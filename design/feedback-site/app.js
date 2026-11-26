/* iCube voice-feedback — recorder + uploader.
 * Storage: Supabase private bucket "feedback-audio", uploads via signed URL
 * obtained from the "feedback-sign" edge function (no keys in this file).
 * Metadata: Supabase table "feedback" (insert allowed for anon).
 */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ijinvtizlocytljflbbr.supabase.co';
  // Publishable key: safe to ship. Every restriction is enforced server-side by
  // row-level security, not by this file.
  const SUPABASE_KEY = 'sb_publishable_6GKGuJDdaHNp1T5gjzAHEg_dlJvW1Jh';
  const BUCKET = 'feedback-audio';
  const API = `${SUPABASE_URL}/rest/v1`;
  const MAX_BYTES = 50 * 1024 * 1024;
  const MAX_SECONDS = 300; // 5 minutes

  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('form'), name: $('name'), reel: $('reel'), notes: $('notes'),
    tabRec: $('tab-rec'), tabUp: $('tab-up'),
    panelRec: $('panel-rec'), panelUp: $('panel-up'),
    recBtn: $('recBtn'), timer: $('timer'), recHint: $('recHint'),
    player: $('player'), audio: $('audio'), redo: $('redo'), meter: $('meter'),
    file: $('file'), dropzone: $('dropzone'), fname: $('fname'), fsize: $('fsize'),
    upPlayer: $('upPlayer'), upAudio: $('upAudio'),
    submit: $('submit'), submitLbl: $('submitLbl'), bar: $('bar'),
    okState: $('okState'), errState: $('errState'), errMsg: $('errMsg'),
    again: $('again'), retry: $('retry'),
  };

  let mode = 'record';
  let mediaRecorder = null;
  let chunks = [];
  let recordedBlob = null;
  let uploadedFile = null;
  let stream = null;
  let audioCtx = null;
  let analyser = null;
  let meterRAF = null;
  let timerInterval = null;
  let startedAt = 0;
  let busy = false;

  /* ---------- helpers ---------- */
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const bytes = (b) => (b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const pickMime = () => {
    const opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const m of opts) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    return '';
  };
  const extFor = (mime) =>
    mime.includes('webm') ? 'webm' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
    : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'audio';

  function refreshSubmit() {
    const ready = mode === 'record' ? !!recordedBlob : !!uploadedFile;
    el.submit.disabled = !ready || busy;
  }

  /* ---------- tabs ---------- */
  function setMode(next) {
    if (busy) return;
    mode = next;
    const rec = next === 'record';
    el.tabRec.setAttribute('aria-selected', String(rec));
    el.tabUp.setAttribute('aria-selected', String(!rec));
    el.panelRec.hidden = !rec;
    el.panelUp.hidden = rec;
    if (!rec && mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
    refreshSubmit();
  }
  el.tabRec.addEventListener('click', () => setMode('record'));
  el.tabUp.addEventListener('click', () => setMode('upload'));

  /* ---------- meter ---------- */
  function startMeter(s) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(s);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      src.connect(analyser);
    } catch { return; }

    const bars = 22;
    el.meter.classList.remove('idle');
    el.meter.innerHTML = '';
    for (let i = 0; i < bars; i++) el.meter.appendChild(document.createElement('i'));
    const nodes = [...el.meter.children];
    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < bars; i++) {
        const idx = Math.floor((i / bars) * data.length);
        const v = data[idx] / 255;
        nodes[i].style.height = `${Math.max(3, v * 30)}px`;
      }
      meterRAF = requestAnimationFrame(draw);
    };
    draw();
  }
  function stopMeter() {
    if (meterRAF) cancelAnimationFrame(meterRAF);
    meterRAF = null;
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    analyser = null;
    el.meter.classList.add('idle');
  }

  /* ---------- recording ---------- */
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showError('This browser can record audio. Try Safari or Chrome, or upload a file instead.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const msg = e?.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow it in your browser settings, or upload a file instead.'
        : 'Could not reach your microphone. You can upload a file instead.';
      showError(msg);
      return;
    }

    const mime = pickMime();
    chunks = [];
    mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = finaliseRecording;

    recordedBlob = null;
    el.player.hidden = true;
    el.recBtn.classList.add('recording');
    el.recBtn.setAttribute('aria-label', 'Stop recording');
    el.recHint.textContent = 'Recording — tap to stop';
    el.timer.textContent = '0:00';
    startedAt = Date.now();

    mediaRecorder.start(250);
    startMeter(stream);
    timerInterval = setInterval(() => {
      const secs = (Date.now() - startedAt) / 1000;
      el.timer.textContent = mmss(secs);
      if (secs >= MAX_SECONDS) stopRecording();
    }, 200);
    refreshSubmit();
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    clearInterval(timerInterval);
    timerInterval = null;
    try { mediaRecorder.stop(); } catch {}
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    stopMeter();
    el.recBtn.classList.remove('recording');
    el.recBtn.setAttribute('aria-label', 'Start recording');
    el.recBtn.disabled = true;
    el.recHint.textContent = 'Saving your recording…';
  }

  function finaliseRecording() {
    const type = mediaRecorder?.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type });
    chunks = [];
    if (!blob.size) {
      el.recBtn.disabled = false;
      el.recHint.textContent = 'Nothing was captured — tap to try again';
      return;
    }
    recordedBlob = blob;
    el.audio.src = URL.createObjectURL(blob);
    el.player.hidden = false;
    el.recBtn.disabled = false;
    el.recHint.textContent = 'Sounds good? Send it below';
    refreshSubmit();
  }

  el.recBtn.addEventListener('click', () => {
    if (busy) return;
    if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
    else startRecording();
  });
  el.redo.addEventListener('click', () => {
    recordedBlob = null;
    el.player.hidden = true;
    el.timer.textContent = '0:00';
    el.recHint.textContent = 'Tap to start recording';
    refreshSubmit();
  });

  /* ---------- file upload ---------- */
  el.file.addEventListener('change', () => {
    const f = el.file.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      showError(`That file is ${bytes(f.size)} — the limit is 50 MB. Try a smaller or compressed version.`);
      el.file.value = '';
      return;
    }
    uploadedFile = f;
    el.fname.textContent = f.name;
    el.fsize.textContent = bytes(f.size);
    el.upAudio.src = URL.createObjectURL(f);
    el.upPlayer.hidden = false;
    refreshSubmit();
  });
  // drag & drop
  ['dragenter', 'dragover'].forEach((ev) =>
    el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.style.borderColor = 'rgba(8,222,170,.7)'; }));
  ['dragleave', 'drop'].forEach((ev) =>
    el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.style.borderColor = ''; }));
  el.dropzone.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const dt = new DataTransfer();
    dt.items.add(f);
    el.file.files = dt.files;
    el.file.dispatchEvent(new Event('change'));
  });

  /* ---------- upload ---------- */
  function showError(msg) {
    el.errMsg.textContent = msg;
    el.errState.classList.add('show');
    el.okState.classList.remove('show');
  }
  function showSuccess(flagged = false) {
    el.errState.classList.remove('show');
    el.okState.classList.add('show');
    el.form.style.display = 'none';
    const sub = el.okState.querySelector('p');
    if (sub) {
      sub.textContent = flagged
        ? 'Your recording is safely stored — I have it. I\'ll pick it up from the files directly.'
        : 'Your voice note landed safely. I\'ll listen through and work the changes into the next version.';
    }
  }
  function resetForm() {
    recordedBlob = null;
    uploadedFile = null;
    el.file.value = '';
    el.player.hidden = true;
    el.upPlayer.hidden = true;
    el.fname.textContent = 'Choose an audio file';
    el.fsize.textContent = 'MP3, M4A, WAV, OGG, WEBM · up to 50 MB';
    el.timer.textContent = '0:00';
    el.recHint.textContent = 'Tap to start recording';
    el.notes.value = '';
    el.bar.classList.remove('on');
    el.bar.firstElementChild.style.width = '0%';
    el.okState.classList.remove('show');
    el.errState.classList.remove('show');
    el.form.style.display = '';
    refreshSubmit();
  }
  el.again.addEventListener('click', resetForm);
  el.retry.addEventListener('click', () => {
    el.errState.classList.remove('show');
    if (el.form.style.display === 'none') el.form.style.display = '';
    refreshSubmit();
  });

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;

    const blob = mode === 'record' ? recordedBlob : uploadedFile;
    if (!blob) return;

    busy = true;
    el.submit.classList.add('busy');
    el.submit.disabled = true;
    el.submitLbl.textContent = 'Sending…';
    el.bar.classList.add('on');
    const fill = el.bar.firstElementChild;

    try {
      const mime = blob.type || 'audio/webm';
      const rawExt = mode === 'record' ? extFor(mime) : (uploadedFile.name.split('.').pop() || '');
      const ext = /^(webm|m4a|mp3|wav|ogg|oga|mp4)$/i.test(rawExt) ? rawExt.toLowerCase() : extFor(mime);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${stamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      // "inbox/" prefix is enforced by the bucket policy
      const objectPath = `inbox/${filename}`;

      // 1. upload the audio straight to the private bucket
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, true);
        xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`);
        xhr.setRequestHeader('apikey', SUPABASE_KEY);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.withCredentials = false;
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) fill.style.width = `${Math.min(99, (ev.loaded / ev.total) * 100)}%`;
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve();
          console.error('[feedback] storage', xhr.status, xhr.responseText);
          reject(new Error(`upload ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('network'));
        const fd = new FormData();
        fd.append('file', blob, filename);
        xhr.send(fd);
      });
      fill.style.width = '100%';

      // 2. metadata row (insert-only; nobody can read rows back without the service key)
      const meta = {
        name: el.name.value.trim() || null,
        about: el.reel.value || null,
        notes: el.notes.value.trim() || null,
        audio_path: objectPath,
        mime_type: mime,
        size_bytes: blob.size,
        duration_hint: mode === 'record' ? el.timer.textContent : null,
      };
      const ins = await fetch(`${API}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(meta),
      });
      if (!ins.ok) {
        // The audio is safely stored; only the note failed. Never make them re-record.
        console.error('[feedback] insert', ins.status, await ins.text().catch(() => ''));
        if (ins.status === 429 || ins.status === 400) {
          showSuccess(true); // flagged for follow-up
          return;
        }
        throw new Error(`insert ${ins.status}`);
      }

      showSuccess();
    } catch (err) {
      console.error('[feedback]', err);
      const m = String(err.message);
      const friendly = m.startsWith('upload')
        ? 'The upload was interrupted. Check your connection and try once more — your recording is still here.'
        : m.startsWith('insert')
          ? 'Your audio arrived but the note could not be saved. Please try again.'
          : 'Something went wrong on the way up. Your recording is still here — please try again.';
      showError(friendly);
    } finally {
      busy = false;
      el.submit.classList.remove('busy');
      el.submitLbl.textContent = 'Send voice note';
      refreshSubmit();
    }
  });

  // press-and-hold space to record? only tap — keep it simple & predictable
  window.addEventListener('beforeunload', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
  });
})();
