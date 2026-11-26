# iCube — Voice Feedback page

A quiet page where anyone can **record or upload a voice note** with corrections.
Styled to match the reels: ink ground, mint accent, Poppins, original untouched logo.

---

## Deploy (one command, ~30 seconds)

```bash
cd design/feedback-site
npx vercel --prod
```

Accept the defaults it offers (`Set up and deploy? y` → your account → new project → `./`).
It prints a `https://…vercel.app` link — **that's the link to send people.**

Everything else is already live and configured. Nothing to paste in, no keys to add,
no build step.

---

## What's already set up in Supabase

Project ref `ijinvtizlocytljflbbr` — all of this is created, enabled and tested:

| piece | state |
|---|---|
| `feedback` table | created, RLS **on** |
| `feedback-audio` bucket | **private** — write-only for visitors |
| `feedback-page` bucket | public (spare; not used by the Vercel route) |
| rate limit | 12 submissions/hour per IP, trigger-enforced |

### Security model

The page ships a Supabase *publishable* key. That's safe — it grants **nothing**
on its own, because every rule is enforced by the database:

- A visitor can **only INSERT** into `feedback`. They cannot read, update or delete rows.
- A visitor can **only upload** into `feedback-audio/inbox/` with an audio extension.
  They cannot list, read, overwrite or delete anything in that bucket.
- Recordings are **not publicly reachable** — no public URL exists for them.
- Row-level policy pins `listened = false` and `starred = false`, so nobody can
  pre-mark their own note as handled.
- 12 per hour per IP, then refused.

Verified live: the 12 insert + 1 rejected boundary was tested directly against the project.

---

## Listening to what people send

**Read the list** (newest first):

```sql
select created_at, name, about, notes, audio_path, duration_hint, listened
from feedback
order by created_at desc;
```

**Play the audio** — Supabase dashboard → Storage → `feedback-audio` → `inbox/`,
find the filename from `audio_path`, and use the download/preview button.

**Mark something done:**

```sql
update feedback set listened = true where id = '<id>';
```

Anything with no matching `feedback` row is still recoverable — the audio exists in
the bucket even if the note failed to save (the page tells the sender it arrived).

---

## Editing the page

All of it is in two plain files — no framework, no build step:

| change | where |
|---|---|
| wording, headline, handle | `index.html` |
| the "what's it about?" options | `<select id="reel">` in `index.html` |
| 50 MB / 5 minute limits | `MAX_BYTES`, `MAX_SECONDS` in `app.js` |
| colours, fonts | the `:root` block in `index.html` |

Redeploy after any edit with the same `npx vercel --prod`.

### Try it locally first

```bash
npx serve . -l 8090     # then open http://localhost:8090
```

Note: recording needs `localhost` or HTTPS — both are fine.

---

## Notes

- Works on iOS Safari, Android Chrome and desktop. Recording uses the browser's
  native `MediaRecorder`; iOS produces `.m4a`, Chrome `.webm` — both accepted.
- Microphone permission is requested only when they tap the record button.
- Maximum 50 MB / 5 minutes per note — plenty for a few minutes of talking.
- Same voice-note text lands in the `name`, `about` and `notes` columns, so you
  know *which reel* each note is about without listening to find out.
