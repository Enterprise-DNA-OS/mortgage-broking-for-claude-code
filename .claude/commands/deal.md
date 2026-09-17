---
description: One deal in full, or move it. Open, stage moves with the guards on, the lender log, and settlement handed to /settle.
---

The operator names a deal by ref ("DL-1016"), client name or address, or asks to open or move one.

**Reading:** run `npm run mortgage -- deal <ref>` and present the card: the client, the amount and LVR, which stage and for how long, the clocks (finance clause, pre-approval expiry, settlement), the lender log, and the advice file with its gaps named. If the file has gaps, say them; they are the to-do list for this deal.

**Opening:** `deal open <client> --amount= [--purpose=] [--lender=] [--security=]`. The advice file is created with all six records missing. If the client has no CDD, say so now, not at submission.

**Moving:** `deal stage <ref> <stage> [--on=] [--note=]`. The stages are lead, fact-find, pre-approval, application, conditional, unconditional, instructed. Know the guards:
- Moving to **application** is refused if the client has no CDD on file. That is the AML/CFT Act 2009, not a preference. Fix it with `cdd <client> --on=`, or `--force` only if the CDD genuinely exists outside this system, and then record it.
- Moving to **pre-approval** stamps a 90 day expiry unless `--expires=` says otherwise.
- Carry the clocks: `--finance-due=` when a sale and purchase agreement lands, `--settlement=` at unconditional.
- **Settled is not a stage move.** Use `settle <ref> --rate= --fixed-until=`; it creates the loan, the expected commission, and the annual review with it.
- Declines carry `--reason=`. The reason is the start of the next deal, so write a real one.

**Logging:** `deal log <ref> "what the lender said"` after every call and email. The quiet-application alarm reads this log; a deal with an empty log looks abandoned because it usually is.
