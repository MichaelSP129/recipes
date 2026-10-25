# Contributing to Michael's Recipes

This repo works the same way as Everyday Plate and Strong Stride. The shared channel is the
[kickoff issue #1](https://github.com/MichaelSP129/recipes/issues/1). Read it first.

## Roles
- **ChatGPT** (reviewer): code review, scaling/quantity correctness, food safety, `recipes.json` data validation, offline/update behaviour.
- **Claude** (reviewer): nutrition/macros, recipe-content accuracy, mobile UX and accessibility.
- **Recipes** (developer bot): works on `recipes/<topic>` branches, opens PRs into `main`, responds to reviews, sweeps issues around 9:00 AM and 6:00 PM Qatar time.
- **Michael**: merges and publishes.
- **Strong Bot**: may also merge a PR, but only once both ChatGPT and Claude have approved its current head and checks are green (Michael's decision, 2026-10-24). The Recipes bot never merges or pushes to `main`.

Reviewers check about 9:30 AM and 6:30 PM Qatar time (06:30 and 15:30 UTC) and stay quiet when nothing is new.
Every comment starts with its author's prefix: **[ChatGPT]**, **[Claude]**, **[Recipes]**.

## Rules
1. Never push to `main`. Exception: new recipes Michael posts to the Recipes bot in chat may be added directly to `recipes.json` on `main`.
2. One finding per issue: severity (P0–P2), evidence/repro, acceptance criteria.
3. One topic per PR, referencing its issue with `Fixes #N`.
4. Don't change the quantities or methods of Michael's recipes without flagging it for his approval.
5. Never weaken food-safety guidance.
6. Only the Recipes bot's PRs bump `VERSION` in `sw.js`. Bump it in every PR that changes the app shell (`index.html`, `app.js`, `app.css`, `manifest.webmanifest`, icons, `sw.js`); `recipes.json`-only changes don't need it. The **checks** GitHub Action fails a PR that changes those files without a new `VERSION`, and also validates `recipes.json` and runs any `tests/*.test.js`.

## Running locally
No build step. Serve the folder with any static server, e.g. `python3 -m http.server 8000`, and open
http://localhost:8000/. GitHub Pages serves `main` at https://michaelsp129.github.io/recipes/.

## Times and the "Quick" tag
- `prepTime` and `cookTime` come only from times stated in the recipe's own method (sum of the steps, using the ranges given). If a step that matters isn't timed, leave the field blank rather than guess.
- Passive time (marinating, brining, soaking, rising, proofing, chilling, resting, cooling) is written separately and labelled, e.g. "Pickled onions at least 20 min (passive)".
- **Quick** = active prep + cooking adds up to **30 min or less**, using the upper end of each stated range, for the version shown first in the method. Passive time doesn't count, but a recipe that needs more than 30 min of waiting before you can eat (e.g. a 1 h minimum marinade) isn't Quick.
- If a cooking step has no stated time (e.g. "brown the mince", "cook per packet", "per batch"), the recipe can't be judged from its text and keeps its current tag until Michael confirms.
- `tests/times.test.js` lists the decision for every Quick recipe; update it when the rule's outcome changes.
