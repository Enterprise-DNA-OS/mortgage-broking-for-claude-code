---
description: Settlement day. Turns a deal into loans on the book, computes the expected upfront off the lender's terms, starts the clawback clock and schedules the annual review.
---

The operator says a deal settled. Never do this with a bare stage move; run the settle command so the money side happens with it.

1. `npm run mortgage -- settle <ref> --on=<date> --rate=5.79 --fixed-until=YYYY-MM-DD [--amount=] [--term=] [--floating]`
2. If the lending is split across tranches, and it usually is, add the others: `loan add <ref> --amount= --rate= --fixed-until=` (or `--floating`). Each tranche carries its own fixed expiry, and each one lands in the refix book on its own date.
3. Read back what the command reports and act on it:
   - **The expected upfront** is computed from the lender's terms in the panel. When the aggregator statement lands: `commission received <loan> --amount=`. Short payments get called out; query them.
   - **The clawback window** starts today. Say how long it is for this lender.
   - **The annual review** is scheduled twelve months out automatically if none is open.
   - **Advice file gaps** are named loudly. A settled deal with a missing record of advice is a breach sitting in the drawer; fix it now with `advice <ref> "record of advice" --on=`.
4. `npm run docs -- settlement-summary` renders the loan structure confirmation for this settlement into `docs-out/`, in the business's brand, with every tranche and its fixed-until date. A person sends it to the client.
5. Log the settlement call: `log <client> "settled, walked through the structure"`.

Nothing here moves money. The lender pays the aggregator, the aggregator pays the business bank account, and this records what was expected against what arrived.
