# Mortgage Broking for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS], a mortgage advice business in [city, country]
- **Operator:** [YOUR NAME], [principal / financial adviser / practice manager]
- **The licence:** [your FAP, or whose licence you operate under, and your aggregator]
- **The team:** [how many advisers, who runs admin, who reconciles the commission statement]
- **The book:** [how many clients, roughly what lending, residential or mixed, which lenders carry most of it]
- **The service promise:** [what ongoing service the disclosure promises: annual review, refix contact at 60 or 90 days]
- **Where the money lives:** [the accounting system the aggregator statement reconciles into. It is not this one.]
- **What matters most:** [for example: no fixed rate ever lapses unwatched, no application goes in without CDD, every settlement's file is complete before the loan draws, no upfront goes unqueried past 30 days]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything for a client, run `client <name>` and read the whole card: every loan part, the contact log, the review status. Before touching a deal, run `deal <ref>` and read the log and the advice file.
3. **Plain language.** Short sentences. No filler. Numbers in tables. The industry words, not software words: a deal, a fact find, a pre-approval, the finance clause, unconditional, instructed, settled, a tranche, a refix, the trail, a clawback, the advice file, CDD.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a client or a lender waits for a yes in this session.
6. **Never invent a number.** Rates, balances, commission figures and dates come from the operator or the database. Rate options come from the lender on the day. If a number is missing, say which one.
7. **Never state a legal position you have not checked.** The CDD rule, the disclosure points, the record-keeping condition and the clawback framing are in `docs/compliance.md` with their sources. Quote the source. If the question is outside what is written there, say so.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What is happening across the deals | `/pipeline` |
| What needs a decision this week | `/attention` |
| Which fixed rates are coming up, who to ring | `/rollovers` |
| A new enquiry came in | `deal open <client> --amount=` (add the client first if new) |
| Move a deal, the lender said something | `deal stage`, `deal log` |
| It settled | `/settle`, then `loan add` for the other tranches |
| What settles this week | `/settlements` |
| The aggregator statement arrived | `/commissions`, then `commission received <loan> --amount=` per line |
| What are we owed, what came in short | `/commissions` |
| A loan was repaid or refinanced away | `discharge <loan> --reason=` |
| A client refixed | `refix <loan> --rate= --until=` |
| How exposed are we if clients leave | `/clawback` |
| What does the book earn | `trail-book`, `/book` |
| Everything about one client, one deal, one loan | `/client`, `/deal`, `loan <number>` |
| The lender panel, their terms, one lender's book | `/lenders`, `lender <name>` |
| Which reviews are owed | `/reviews-due`; done ones via `review done` |
| Is the file complete, what would the FMA find | `/compliance`, `/advice-file` |
| Identity verified for a client | `cdd <client> --on=` |
| A record of advice or disclosure went on file | `advice <deal> "<record>" --on=` |
| I spoke to them, chase this, that is done | `/log` |
| The letter about the expiry, the review note | `/draft-refix-letter`, `/draft-review-note` |
| The Monday review | `/weekly-review` |
| Bring the book over from the old system | `/import` |
| Change how this system works | `/customise` |
| A new page to look at | `/new-view` |
| The paperwork, in our brand | `npm run docs` |

If an ask fits nothing here, run the CLI directly (`npm run mortgage -- help`) and then propose a new command for it.

## Hard rules

- **No client money, no lodgement, ever.** This system does not hold funds, does not submit applications, does not talk to a lender portal. The commission ledger records expectations against receipts so reconciliation works, and nothing more. If asked to add lodgement or payments, say no and say why.
- Never send email or letters from here. Draft to `drafts/`, render with `npm run docs`, a person sends. That includes every refix letter, review note and settlement summary.
- Never move a deal to application while the client's CDD is empty. The CLI refuses; `--force` exists only for CDD that genuinely lives outside this system, and then the record gets fixed immediately (AML/CFT Act 2009).
- Never mark an advice record on file that does not exist somewhere real. The table is an index of evidence, not a scoreboard. Records are kept seven years (FAP Standard Condition 1), which requires them to exist.
- Never settle with a bare stage move. `settle` creates the loan, the expected commission and the review; a stage edit creates a lie with a date on it.
- Never invent a rate, ever, including in drafts. Rate options come from the lender on the day.
- Never guess a clawback figure as final. The straight-line estimate is raised at discharge and corrected to the lender's statement figure when it lands.
- Never delete records without an explicit yes in this session. A client who leaves is `status = 'former'`; a loan that ends is `discharge`. The file is a long record.
- Never invent a record. If a name or a reference is ambiguous, list the candidates and ask. The CLI already does this.
- The database is the source of truth. If the answer is not in it, say so.

## Words this business uses

- A **client** is one borrowing household or entity: a person, a couple, a company or a trust. Companies and trusts take **enhanced CDD**.
- A **deal** is one lending scenario moving through stages: lead, fact-find, pre-approval, application, conditional, unconditional, instructed, settled. The **finance clause** on a sale and purchase agreement is the date the deal dies if the approval has not landed.
- A **pre-approval** expires, usually at ninety days. An expired one during a house hunt is a client who cannot bid.
- A settlement splits into **tranches** (loan parts), each on its own rate and term. **Fixed until** is the expiry date; the **refix** is the conversation and the re-fixing at that date. A lapsed fixed rate rolls the client onto the lender's **floating rate**.
- The **upfront** is the commission paid at drawdown, a percentage of the amount. **Trail** is the ongoing percentage per year on the balance, where the lender pays one. A **refix fee** is the flat payment some lenders make per refix.
- A **clawback** is the lender taking upfront commission back when a loan repays or refinances early, inside a window of up to about 27 months depending on the lender. The window and the schedule are the lender's; the panel records them.
- The **advice file** is the six records every deal carries: scope of service disclosure, fact find, affordability evidence, CDD, commission and clawback disclosure, and the record of advice.
- **CDD** is customer due diligence under the AML/CFT Act 2009, done before the business relationship is established, which in practice means before anything is submitted.
- The **annual review** is the ongoing service promised in the disclosure. It is also where top-ups, restructures and referrals come from.

## Where things live

- `scripts/mortgage.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it. Never edit an applied migration; add the next one.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `brand.json`, `views.json`, `documents.json` the HTML output: whose name is on it, what pages, what paperwork.
- `docs/compliance.md` the rules `/compliance` checks, each with its source. `docs/replace-trail.md` moving off the incumbent. `docs/why-no-front-end.md` the honest trade-offs.
- `exports/` whole database dumps. `drafts/` anything written for a person to send.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/trail
