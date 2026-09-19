# Verification

> **TL;DR:** The model and browser checks use only invented learners and numbers. They exercise the actual learning ladder, local setup, backups, conflicting tabs and the complete offline file.

Run `npm ci`, `npm test`, and `npm run build`. For the browser checks:

```sh
python3 -m pip install playwright==1.58.0
python3 -m playwright install chromium
python3 scripts/test-browser.py
```

The core tests cover leading zeros, backward chaining, delayed proof, review caps/misses, deterministic distractors, configuration bounds, malformed progress, number-change invalidation, backup validation, concurrent writes, erase/replacement guards and unavailable storage coordination.

Browser scenarios include the reproduced cross-learner delayed-completion bug and null-storage crash; a full learning ladder with controlled time; delayed proof and two reviews; rapid repeated final input; form setup/reload; actual backup download/import; rejected malformed backup; erase confirmation; and a second tab attempting to resurrect erased data. The standalone file is exercised with all HTTP requests blocked, including setup, saved reload and license credits. Real viewport layouts are checked at 320, 390, 768 and 1440 pixels. Nested-path hosting and quota-failure export are separate scenarios.

The automated speech checks use fake browser voices and do not establish audio quality. Chromium is the tested browser. Real phone keyboards, other browsers, installed operating-system voices, screen readers and long household use remain additional compatibility work. Browser storage can be cleared or become unavailable; backups are part of the intended workflow.
