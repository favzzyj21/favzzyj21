// drop-assemble — stitches chunked long-recording uploads back into one file.
// Deployed to Supabase as `drop-assemble` (verify_jwt: false), version 2.
//
// Why this exists: Supabase caps a single object at 50 MB, and a two-hour
// meeting recording is far larger. The page uploads ~8 MB pieces; this function
// streams them back together server-side so nothing has to fit in memory and
// nothing ever has to be downloaded to reassemble.
//
// IMPORTANT: storage listing is the source of truth. Part rows in drop_parts are
// only a convenience for the resume UI — a failed bookkeeping write must never
// lose audio, so assembly reads what is actually in the bucket.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ok = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return ok({ error: 'method' }, 405);

  const URL = Deno.env.get('SUPABASE_URL')!;
  const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const BUCKET = 'drop-audio';

  const rest = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => '')}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };

  // A retried piece lands as `<n>.r<attempt>.part`, so match both shapes.
  const listParts = async (sid: string) => {
    const r = await fetch(`${URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix: `inbox/${sid}`,
        limit: 2000,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!r.ok) throw new Error(`list ${r.status} ${await r.text().catch(() => '')}`);
    return (await r.json()) as Array<{ name: string; metadata?: { size?: number } }>;
  };

  let body: { session_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return ok({ error: 'bad json' }, 400);
  }

  const sid = String(body.session_id || '');
  if (!uuidRe.test(sid)) return ok({ error: 'bad session' }, 400);
  const action = String(body.action || 'status');

  let rows;
  try {
    rows = await rest(
      `drop_sessions?session_id=eq.${sid}&select=session_id,file_name,mime_type,total_bytes,chunk_size,total_parts,sender,topic,notes,received`,
    );
  } catch (e) {
    return ok({ error: 'lookup failed', detail: String(e) }, 500);
  }
  if (!rows || !rows.length) return ok({ error: 'not found' }, 404);
  const s = rows[0];

  // ---- status: which parts have landed, so the browser can resume ----
  if (action === 'status') {
    const objs = await listParts(sid);
    const have = new Set<number>();
    let bytes = 0;
    for (const o of objs) {
      const m = o.name.match(/^(\d+)(?:\.r\d+)?\.part$/);
      if (!m) continue;
      const n = Number(m[1]);
      if (!have.has(n)) {
        have.add(n);
        bytes += Number(o.metadata?.size || 0);
      }
    }
    return ok({ session: s, parts: [...have].sort((a, b) => a - b), bytes });
  }

  // ---- finalize: join the pieces into one file ----
  if (action === 'finalize') {
    if (s.received) return ok({ already: true, file_name: s.file_name });

    const objs = await listParts(sid);
    // index -> best object name for that index (prefer the plain name, else a retry)
    const pick = new Map<number, string>();
    for (const o of objs) {
      const m = o.name.match(/^(\d+)(?:\.r(\d+))?\.part$/);
      if (!m) continue;
      const n = Number(m[1]);
      const isRetry = m[2] !== undefined;
      const cur = pick.get(n);
      if (!cur || (isRetry && cur.includes('.r'))) pick.set(n, o.name);
    }

    const missing: number[] = [];
    for (let i = 0; i < s.total_parts; i++) if (!pick.has(i)) missing.push(i);
    if (missing.length) {
      return ok(
        { error: 'incomplete', missing: missing.slice(0, 50), received: pick.size, of: s.total_parts },
        409,
      );
    }

    const target = `inbox/done/${sid}/${s.file_name}`;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (let i = 0; i < s.total_parts; i++) {
          const name = pick.get(i)!;
          const r = await fetch(`${URL}/storage/v1/object/${BUCKET}/inbox/${sid}/${name}`, {
            headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
          });
          if (!r.ok || !r.body) {
            controller.error(new Error(`part ${i}: ${r.status}`));
            return;
          }
          const reader = r.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        }
        controller.close();
      },
    });

    const up = await fetch(`${URL}/storage/v1/object/${BUCKET}/${target}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': s.mime_type || 'application/octet-stream',
        'x-upsert': 'true', // service-role only; the anon restriction does not apply here
      },
      body: stream,
      // @ts-ignore duplex is required for streaming request bodies
      duplex: 'half',
    });
    if (!up.ok) {
      return ok({ error: 'stitch failed', status: up.status, detail: await up.text().catch(() => '') }, 502);
    }

    // confirm the stored size matches what the sender declared
    const head = await fetch(`${URL}/storage/v1/object/info/${BUCKET}/${target}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    const info = head.ok ? await head.json().catch(() => null) : null;
    const got = info?.size ?? info?.metadata?.size ?? null;

    await rest(`drop_sessions?session_id=eq.${sid}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ received: true }),
    });

    // tidy the pieces; the stitched file is the keeper
    for (const name of pick.values()) {
      await fetch(`${URL}/storage/v1/object/${BUCKET}/inbox/${sid}/${name}`, {
        method: 'DELETE',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      }).catch(() => {});
    }

    return ok({
      done: true,
      path: target,
      file_name: s.file_name,
      bytes: Number(s.total_bytes),
      verified_size: got,
      size_ok: got === null ? null : Number(got) === Number(s.total_bytes),
    });
  }

  return ok({ error: 'unknown action' }, 400);
});
