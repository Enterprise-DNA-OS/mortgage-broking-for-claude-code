---
description: Draft the annual review invitation or follow-up note for one client, from their file, into drafts/. Never sends.
---

The operator names a client whose review is due, overdue, or just done.

1. Run `npm run mortgage -- client <name>` and read everything: the book, the rates and expiries, deals in flight, the last review's note, the contact log. The note must show the adviser has actually looked at their file, because that is the entire difference between a review and a newsletter.
2. Write to `drafts/review-<client>.md`, in the business's voice:
   - **An invitation** (due or overdue): one or two specifics from their file that make the meeting worth an hour: the tranche ending in November, the interest-only term maturing next year, the lending against today's rates. Offer times. No guilt, no boilerplate.
   - **A follow-up** (review just done): what was discussed, what was decided, what happens next and who does it. This becomes part of the advice record, so it is accurate or it is not written.
3. If they want the full pack for the meeting, `npm run docs -- annual-review-summary` renders it branded.
4. When the meeting lands, `review done <client> --on=` and `log <client> "..."` so the book stays true.

Never send. Never invent a number. If the file is too thin to write a specific note, say so; the fix is a conversation, not better prose.
