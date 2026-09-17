---
description: Bring the book across from Trail, Salestrekker, Mercury Nexus or a plain CSV. Clients, loans and open deals, dry run first, gaps flagged honestly.
---

The operator has exports from the old system. The full walkthrough is [docs/replace-trail.md](../../docs/replace-trail.md); the short version:

1. Three files, any of them optional except clients on the first run:
   - **Clients** (Trail's contacts export, saved as CSV): name, email, phone, type.
   - **Loans** (the mortgage or lending export): client, lender, loan number, amount, balance, rate, fixed expiry, drawdown date, repayment.
   - **Deals** (the pipeline or opportunities export): client, stage, amount, lender.
   The importer matches column names case-insensitively and accepts the common variants; nothing needs renaming.
2. Dry run first, always:
   `npm run mortgage -- import trail --clients=clients.csv --loans=loans.csv --deals=deals.csv --dry-run`
   Nothing is written. Read the counts and every skip reason. The usual cause of a skip is a loan whose client name does not match the client file exactly.
3. Then the same command without `--dry-run`. Salestrekker and Mercury exports go through `salestrekker` or `mercury` in place of `trail`; anything else through `csv`.
4. Check it: `stats`, `clients`, `book`, `rollovers`. The loan count and the fixed expiry dates are the two things to verify against the old system, because the refix book is the first thing this system runs on.

What arrives deliberately incomplete, and why:
- **No CDD dates.** The old system saying nothing is not evidence. `cdd <client> --on=` as each file is verified.
- **Empty advice files on imported deals.** Same reason. `/compliance` now lists exactly what to backfill.
- **Unknown lenders created with zero commission terms.** Fill them from the aggregator agreement before the first settlement computes against them.
