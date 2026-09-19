# How Remember Your Numbers works

> **TL;DR:** The full personal game is preserved: chunked practice, backward-chained fills, delayed proof and spaced reviews. Public setup replaces the original fixed personal data with a local form and fictional examples.

A number is a digit string plus chunk lengths. Strings preserve leading zeros. Each number has an independent learning ladder: learn, missing-chunk choice, one fill level per chunk, first-digit hint, cold recall and delayed proof. Fill levels hide chunks from the end first. Learning requires two complete tapping passes; the choice round asks about every chunk in reverse order.

The first successful cold pass starts a 20-hour wait. Practice remains available during that wait. A clean delayed proof marks the number mastered and schedules review after two days. Successful due reviews double the interval to a 30-day cap; a missed due review resets it to two days without removing the mastered label. Ordinary fill/recall rounds allow one mistake; proof requires none. Two consecutive input misses show a temporary reminder. These are game rules, not a measured guarantee of memorization.

Every delayed transition belongs to a round generation and the selected learner/number. Navigation, configuration changes and conflicts cancel timers and speech. Final inputs lock immediately; completion is idempotent. Browser tests cover leaving one learner during the completion delay and duplicate final review taps.

## Configuration and state

The setup supports 1–12 learners with 1–12 numbers each. Numbers contain 2–24 digits in up to eight chunks of 1–8 digits. IDs are bounded and reject prototype-related keys. Unknown imported fields are discarded. Rendered labels use text nodes rather than HTML. The digit/chunk signature binds progress to the actual material; changing a label preserves it, changing digits or chunks resets it.

One versioned localStorage envelope holds setup and progress. Writes use a shared Web Lock around read/compare/write. A tab compares the actual stored snapshot with its last known baseline before writing. Storage events retire older tabs early; the guarded write catches changes even if the event has not run. There is no uncoordinated persistence fallback. Missing locks or failed storage leave a visible temporary session with export.

A conflict stops play and offers reload or deliberate export of that tab's older copy. Automatic writes never reconcile different versions by overwriting one. The user can inspect their backups and import their chosen version. An unreadable saved file is preserved for an explicit recovery download; a temporary fictional demo cannot overwrite it. Reset removes only this app's saved envelope, after confirmation. Downloaded backups remain separate.

## Speech and delivery

Speech starts off. The UI uses only SpeechSynthesis voices whose localService flag is true, preferring English. If no such voice is available it remains silent. The flag is the browser's report; operating-system internals are outside this application's verification. Navigation and mute cancel queued speech.

The hosted build is a classic bundled script with a vendored font. The complete HTML embeds that exact script and font. A content security policy blocks network connections; there is no provider SDK, backend configuration, account or analytics code. Root, nested-path and standalone-file operation are checked with invented data. Personal configuration never belongs in the public default module.
