// drop-assemble — stitches chunked long-recording uploads back into one file.
// Runs without JWT verification (the page is open to anyone with the link).
// Every privileged action is guarded by the caller proving it knows the session id
// it just created; nothing is ever readable back to the browser.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'drop-audio';

const ok = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`rest ${path}: ${r.status} ${await r.text().catch(() => '')}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return ok({ error: 'method' }, 405);

  let body: { session_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return ok({ error: 'bad json' }, 400);
  }

  const sid = String(body.session_id || '');
  const action = String(body.action || 'status');
  if (!uuidRe.test(sid)) return ok({ error: 'bad session' }, 400);

  // The session id is an unguessable v4 uuid handed only to the uploader, so it
  // doubles as the capability token for this session.
  let rows;
  try {
    rows = await rest(
      `drop_sessions?session_id=eq.${sid}&select=session_id,file_name,mime_type,total_bytes,chunk_size,total_parts,sender,topic,notes,received`,
    );
  } catch (e) {
    return ok({ error: 'lookup failed', detail: String(e) }, 500);
  }
  if (!rows || rows.length === 0) return ok({ error: 'not found' }, 404);
  const s = rows[0];

  // ---- status: which parts have landed, so the browser can resume ----
  if (action === 'status') {
    const parts = await rest(`drop_parts?session_id=eq.${sid}&select=part_no,bytes&order=part_no.asc`);
    return ok({ session: s, parts: parts || [] });
  }

  // ---- finalize: verify every part, stitch, store the single file ----
  if (action === 'finalize') {
    if (s.received) return ok({ already: true, file_name: s.file_name });

    const parts = (await rest(`drop_parts?session_id=eq.${sid}&select=part_no,bytes&order=part_no.asc`)) || [];
    const have = new Set<number>(parts.map((p: { part_no: number }) => p.part_no));
    const missing: number[] = [];
    for (let i = 0; i < s.total_parts; i++) if (!have.has(i)) missing.push(i);
    if (missing.length) return ok({ error: 'incomplete', missing, received: parts.length, of: s.total_parts }, 409);

    const gotBytes = parts.reduce((a: number, p: { bytes: number }) => a + Number(p.bytes), 0);
    if (gotBytes !== Number(s.total_bytes)) {
      return ok({ error: 'size mismatch', expected: s.total_bytes, got: gotBytes }, 409);
    }

    // Stream the parts in order into a single object, so a 124 MB recording never
    // has to sit in memory here.
    const target = `inbox/done/${sid}/${s.file_name}`;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (let i = 0; i < s.total_parts; i++) {
          const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/inbox/${sid}/${i}.part`, {
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
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

    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${target}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': s.mime_type || 'application/octet-stream',
        'x-upsert': 'false',
        'cache-control': 'max-age=3600',
      },
      body: stream,
      // @ts-ignore: needed by fetch for streaming uploads
      duplex: 'half',
    });
    if (!up.ok) {
      return ok({ error: 'stitch failed', status: up.status, detail: await up.text().catch(() => '') }, 502);
    }

    await rest(`drop_sessions?session_id=eq.${sid}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ received: true }),
    });

    // tidy the chunk objects; the stitched file is the keeper
    for (let i = 0; i < s.total_parts; i++) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/inbox/${sid}/${i}.part`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      }).catch(() => {});
    }

    return ok({ done: true, path: target, file_name: s.file_name, bytes: Number(s.total_bytes) });
  }

  return ok({ error: 'unknown action' }, 400);
});
