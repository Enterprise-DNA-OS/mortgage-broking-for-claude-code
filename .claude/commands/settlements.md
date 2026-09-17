---
description: Settlements booked and just landed, with the advice file position on each. The week's hard deadlines.
---

1. Run `npm run mortgage -- settlements`.
2. Booked ones first, soonest first. For each: the client, the lender, the day count, and whether the advice file is complete. A settlement in three days with a gap in the file is the most urgent kind of paperwork there is; after settlement it stops being paperwork and becomes a breach.
3. For each booked settlement, the checklist is short and the same every time: solicitor has instructions, insurance is arranged (a lender condition, not a suggestion), the client knows the day, and the file is complete.
4. On the day: `settle <ref> --on=today --rate= --fixed-until=`, then the tranches with `loan add`. Never a bare stage move; the money side happens in the settle command.
5. Recently landed ones: check the upfront arrived (`commissions`), and send the settlement summary (`npm run docs -- settlement-summary`, then a person sends it).

Log what happens: `deal log <ref> "docs signed at Turner & Rowe"`. The record of a settlement is worth more than the memory of one.
