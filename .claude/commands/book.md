---
description: The loan book. Every active loan with its rate, fixed expiry, repayment type and clawback position, by lender or by adviser.
---

1. Run `npm run mortgage -- book [--lender=] [--adviser=]`.
2. Lead with the totals: how many loans, the total balance, the weighted average rate. Those three numbers are the business.
3. Then read it the way a principal does:
   - The fixed-until column, soonest first, is the work coming. `rollovers` is the same list with the contact dates attached.
   - The clawback column shows which upfronts are still at risk.
   - Interest-only loans have their own clock: the lender will want them back on principal and interest eventually, and that is a review conversation.
4. `trail-book` collapses the same data to what it earns per year, by lender. `lender <name>` shows one lender's slice with its terms.
5. `loan <number>` is the single-loan card with its whole commission ledger.

Keep the balances honest: `refix <loan> --rate= --until= [--balance=]` takes a new balance when the client has been paying down, and the trail arithmetic follows it.
