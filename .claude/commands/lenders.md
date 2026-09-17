---
description: The panel. Each lender's commission terms, clawback window, turnaround and book, and one lender in full with its deals in flight.
---

**The panel:** run `npm run mortgage -- lenders`. It shows what each lender pays (upfront, trail, refix fee), the clawback window, the typical turnaround, the BDM, and how much of the book sits with them. Concentration is worth a sentence when one lender holds most of it.

**One lender:** `npm run mortgage -- lender <name>` adds their deals in flight and their slice of the book, with each loan's clawback position.

Two things to keep true:

1. **The terms are data.** Every expected upfront, trail line and refix fee is computed from this table. When the aggregator schedule changes, change it here first: `add lender` for a new one, or ask for the update and write it with `/customise`. A lender created by `import` arrives with zero terms on purpose; fill them in before the first settlement computes.
2. **Turnaround is a promise to check.** The quiet-application alarm fires at ten days; if a lender's queue is genuinely running at fifteen, record it on the lender (`turnaround_days`) so expectations are set from the record, not from optimism.

The clawback notes carry each lender's real schedule wording. The straight-line estimate in `/clawback` is the approximation; the note is the truth.
