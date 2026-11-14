# Wordle Masters
Daily 5-letter word game (static site, no build step). Open index.html via any static server.
- Rename: change NAME in app.js and <title>/<h1>/help text in index.html.
- Puzzle #1 = 14 Nov 2026 (EPOCH in app.js); puzzle N uses DF_ANSWERS[(N-1) % length] by the player's local date.
- Debug (localhost only): ?debug=1 logs the answer and sets window.__wb; &date=YYYY-MM-DD plays another day.
- Word lists: build/gen.py (ENABLE public domain + dwyl/english-words Unlicense; ranking via wordfreq data CC BY-SA 4.0).
- Test: build/test.py (Playwright).
- Username: chosen on first visit (2-20 chars, A-Z a-z 0-9 _), stored in localStorage key wordlemasters:username (locked once set). No server/accounts.
- Answer order: build/space.py + build/space2.py keep similar answers >=30 days apart (verified min gap 30).
- Flow: welcome animation every open -> (first visit: username) -> calendar (only today playable; past days show your result) -> game.
- Leaderboard: Supabase project jhhjfgydktndtlhsjzvo via RPCs claim_username, submit_result, get_today_board, get_alltime_board (publishable key in app.js). Tables are not directly readable; device_id stays private.

## Backend
Supabase project jhhjfgydktndtlhsjzvo, isolated `wm` schema (tables), `wm_private` (push key), RPCs `public.wm_*`, bucket `wm-avatars`, Edge Functions `wm-push-reminders` and `wm-avatar`, cron `wm-daily-reminder` / `wm-nominate-reminder`. Shares nothing with Word Bend's data.
