---
description: Where the money is. Upfronts owed and short, trail reconciled by month, refix fees, clawbacks raised. The aggregator statement check that never gets done by hand.
---

The operator asks what is owed, what arrived, or wants the statement reconciled.

1. Run `npm run mortgage -- commissions [--days=]`.
2. Lead with the number at the top: how much is still owed. Then read the three tables:
   - **Upfronts and refix fees.** Anything NOT YET thirty days after drawdown gets queried with the aggregator this week; name the loan, the lender and the amount. Anything with a negative variance arrived short, and short payments stay short until someone asks.
   - **Trail.** The recent months, expected against received per loan. A missing trail month on a loan that pays trail is the same problem as a missing upfront, just smaller and easier to ignore.
   - **Clawbacks raised.** Each one is an estimate until the lender's statement figure lands; correct the entry when it does.
3. When money arrives: `commission received <loan> --amount= [--kind=upfront|trail|refix fee] [--on=]`. The command matches it to the open expected entry and calls out any variance on the spot.
4. `trail-book` answers the bigger question: what the book earns per year by lender, and how much of it reaches a fixed expiry inside 90 days.

The expected figures come from the lender terms in the panel (`lenders`). If a lender changed its schedule, fix the panel first, or every future settlement computes wrong.
