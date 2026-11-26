# iCube — Long Recording Drop

The sister page to the voice-note link, built for **big files**: meeting audio,
two-hour sessions, full voice memos. Same brand, same security model, but it
uploads in pieces so size and flaky connections stop being a problem.

---

## Why this exists alongside the voice-note page

| | voice-note page | this page |
|---|---|---|
| best for | a 30-second note of corrections | a 2-hour meeting recording |
| ceiling | 50 MB | **5 GB** |
| transport | one request | ~8 MB pieces, 4 in parallel |
| if the connection drops | start again | **resumes from the last piece** |
| if the tab closes | lost | **resumes when they come back** |
| rate limit | 12 per hour | 6 per hour |

Supabase caps a single object at 50 MB, and your meeting recording is 124 MB —
so a single-request upload could never work. Chunking is the fix, not a preference.

---

## Deploy

```bash
cd design/drop-site
npx vercel --prod
```

Same as the other page — accept the defaults, and it prints the link to share.

---

## How the pieces become one file

1. The browser picks a file and creates a **session** (an unguessable UUID) in
   `drop_sessions`. The UUID is also stored in the sender's browser.
2. The file is sliced into 8 MB pieces and pushed four at a time into
   `drop-audio/inbox/<session>/<n>.part`. Each piece is retried up to 4 times
   with back-off before the upload gives up.
3. Every landed piece gets a row in `drop_parts` — that's the resume ledger.
4. On finish, the page calls the **`drop-assemble`** edge function, which:
   checks every piece is present and the byte total matches,
   streams the pieces back in order into `inbox/done/<session>/<filename>`,
   marks the session received, and deletes the temporary pieces.
5. The result is **one playable file** in Storage, with the original name intact.

The assembly happens server-side as a stream, so a 2-hour file never has to fit
in memory anywhere.

---

## Security (same rules as the voice page, verified)

Visitors hold only the publishable key, which grants nothing by itself:

| action | anon | verified |
|---|---|---|
| create an upload session | ✅ | ✓ |
| mark a session as already-received | ❌ | ✓ rejected by policy |
| read any session | ❌ | ✓ anon saw 0 rows while admin saw 1 |
| update / delete sessions | ❌ | ✓ silently affects nothing |
| upload a piece into `inbox/` | ✅ | ✓ |
| read / list / delete any audio | ❌ | ✓ 0 objects visible |
| start more than 6 uploads an hour | ❌ | ✓ tripwire fired in test |

The session UUID is the capability token: only the browser that created it knows
it, and the edge function will only assemble a session that exists-and-is-complete.
Nothing in the bucket is publicly reachable, and no public URL exists for any file.

---

## Reading what arrives

```sql
select created_at, sender, topic, file_name, total_bytes, received
from drop_sessions
order by created_at desc;
```

Play it in the dashboard: **Storage → `drop-audio` → `inbox/done/<session>/`**.

The `drop_parts` table is just bookkeeping — it can be ignored day to day.
Anything with `received = false` was interrupted; the person can reopen the link
and continue, and the pieces are still sitting there when they do.

Useful housekeeping (dashboards can't run this for people automatically):

```sql
-- abandoned attempts older than a week
select * from drop_sessions where received = false and created_at < now() - interval '7 days';
```

---

## Editing

| change | where |
|---|---|
| headings, wording, footer tip | `index.html` |
| the "what's this recording?" list | `<select id="topic">` in `index.html` |
| piece size | `CHUNK` in `app.js` (keep under 50 MB) |
| ceiling | `MAX_BYTES` in `app.js` |
| uploads per hour | `> 6` in `drop_check_rate()` in SQL |
| colours, fonts | the `:root` block in `index.html` |

The edge function lives at `supabase/functions/drop-assemble/index.ts`, kept here
for reference and future redeploys.

### Local test

```bash
npx serve . -l 8092
```

---

## The bug that broke the first version

If uploads fail with `new row violates row-level security policy`, the cause is
almost always **`x-upsert: true`**. Upsert makes Storage check INSERT **and**
SELECT **and** UPDATE policies, and the SELECT/UPDATE policies here are
deliberately `false` so that no visitor can read another's audio.

The page therefore uploads with a plain INSERT and no upsert header. When a
retried piece would collide, it lands under a new name (`3.r1.part`) and the
assemble function resolves it back to part `3`. Verified end to end: a 3-part
file with a retried middle piece reassembled to the exact original bytes.

Two other traps worth remembering:

- `chunk_size` in the INSERT policy must be between 1 MB and 16 MB. A tiny value
  (used in an early test) is rejected by the policy, not by the app.
- Direct `DELETE FROM storage.objects` is blocked by Supabase. Remove objects
  through the Storage API or the dashboard.

## Honest limits

- **Phone screens sleep.** A 2-hour upload is a long time to keep a tab
  foregrounded, which is why resume exists. The page warns before letting them
  navigate away mid-upload.
- **Free-tier storage is 1 GB.** A handful of long recordings will use it up
  quickly — check the dashboard if uploads start failing near the end.
- **Pieces are not encrypted beyond HTTPS/TLS**, same as any upload page. The
  bucket is private.
- Abandoned sessions leave pieces behind; the housekeeping query above finds them.
