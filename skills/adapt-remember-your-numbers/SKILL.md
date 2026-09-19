---
name: adapt-remember-your-numbers
description: Adapt the Remember Your Numbers learning game while preserving its full progression, private local setup, safe saves and offline delivery.
---

Read README.md and docs/design.md, then inspect the actual source and tests. Ask for the intended behavior when it is unclear. Keep one writer and preserve unrelated changes.

Make general changes in the public engine. Never put personal numbers, learner names, backups, screenshots or recordings into public examples, tests or history. Invent independent fixtures. Configuration belongs in the local setup form.

Preserve the complete learning ladder, leading zeros, content-bound progress, timer cancellation, default-off speech, guarded cross-tab writes and backup recovery. Do not silently replace a full feature with a stub. Keep browser-reported local-only voice selection and the temporary-session fallback when persistence cannot be safe.

For behavior fixes, reproduce the issue with invented data and add a focused regression test. Run npm test, npm run build and the relevant browser scenarios. Check the exact downloadable HTML with network blocked, root/subpath hosting, phone layout and all shipped notices. Explain tested limits honestly.

Improve the README first-use path when a change affects setup. Keep GitHub and website copies connected through a fixed reviewed release, with personal state outside source control.
