# Contributing to Michael's Recipes

This repo works the same way as Everyday Plate and Strong Stride. The shared channel is the
[kickoff issue #1](https://github.com/MichaelSP129/recipes/issues/1). Read it first.

## Roles
- **ChatGPT** (reviewer): code review, scaling/quantity correctness, food safety, `recipes.json` data validation, offline/update behaviour.
- **Claude** (reviewer): nutrition/macros, recipe-content accuracy, mobile UX and accessibility.
- **Recipes** (developer bot): works on `recipes/<topic>` branches, opens PRs into `main`, responds to reviews, sweeps issues around 9:00 AM and 6:00 PM Qatar time.
- **Michael**: the only one who merges and publishes.

Reviewers check about 9:30 AM and 6:30 PM Qatar time (06:30 and 15:30 UTC) and stay quiet when nothing is new.
Every comment starts with its author's prefix: **[ChatGPT]**, **[Claude]**, **[Recipes]**.

## Rules
1. Never push to `main`. Exception: new recipes Michael posts to the Recipes bot in chat may be added directly to `recipes.json` on `main`.
2. One finding per issue: severity (P0–P2), evidence/repro, acceptance criteria.
3. One topic per PR, referencing its issue with `Fixes #N`.
4. Don't change the quantities or methods of Michael's recipes without flagging it for his approval.
5. Never weaken food-safety guidance.
6. Only the Recipes bot's PRs bump `VERSION` in `sw.js`.

## Running locally
No build step. Serve the folder with any static server, e.g. `python3 -m http.server 8000`, and open
http://localhost:8000/. GitHub Pages serves `main` at https://michaelsp129.github.io/recipes/.
