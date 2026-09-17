---
description: Every open deal with both clocks on it, the finance clause and the pre-approval expiry, grouped by stage. The board a broking principal reads first.
---

The operator wants the pipeline. Arguments might be a stage ("application"), an adviser name, or nothing.

1. Run `npm run mortgage -- pipeline [--stage=] [--adviser=]`.
2. Lead with three numbers: how many deals, the total, and how much of it is sitting at lenders right now. That last one is the money in flight.
3. Then read the clocks, because the pipeline is really a list of deadlines:
   - **A finance clause inside five days on a deal that is not unconditional.** That is today's phone call. The vendor's agent is already circling.
   - **A pre-approval inside fourteen days of expiry.** The client is still bidding; the approval dies before they win unless it is extended.
   - **Anything sitting in one stage for more than ten days** with nothing in the log. Quiet applications are the ones that die.
4. Name the adviser on every line. A pipeline without names does not get worked.
5. Flag any deal whose advice file shows gaps at application or later. The file is built during the deal, not after settlement.
6. End with the two or three deals to touch today and one line each on why.

Move a deal when the operator says so:
- `deal stage <ref> application --finance-due=` when it goes in
- `deal stage <ref> conditional` / `unconditional --settlement=`
- `deal log <ref> "what the lender said"` after every call, because the quiet-application check reads this log
- `settle <ref> --rate= --fixed-until=` on settlement day, never a bare stage move

Nothing here submits anything to a lender. This is the record of a pipeline that lives in the lender portals.
