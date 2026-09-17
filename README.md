<h1 align="center">Mortgage Broking for Claude Code</h1>

<p align="center">
  <strong>The open-source mortgage broker system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Or installed and run for you.
</p>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#compliance-checked-against-the-data">Compliance</a> &bull;
  <a href="#ten-questions-trail-cannot-answer">Ten questions</a> &bull;
  <a href="#instead-of-trail">Instead of Trail</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Mortgage Broking for Claude Code does the job you pay Trail for, as a Postgres database and a set of Claude Code commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) and ask for what you want in plain language. It runs the right query, and it can answer questions the Trail dashboard cannot.

It is built for a mortgage advice business: the clients and the AML/CFT due diligence behind each one, the deal pipeline from lead to settlement with the finance clause clock on it, the advice file every deal must carry with each record citing its source, the loan book with its fixed rate expiry dates, the commission ledger (upfront, trail, refix fees, clawback), the lender panel with its real terms as data, and the annual review book. The words are the words an adviser already uses.

**Nobody's money is in here and nothing submits to a lender.** Applications keep going through the lender's channel; the aggregator keeps paying the business bank account. This records what was advised, what settled, what is owed and what the regulator expects to find on file. That boundary is deliberate.

```
/pipeline                         every open deal, with the finance clause and pre-approval clocks on it
/rollovers                        the refix book: every fixed rate reaching expiry, and who has not been rung
/attention                        everything that wants a decision this week, worst first
/settlements                      booked and just landed, with the advice file position on each
/commissions                      upfronts owed, trail reconciled, short payments, clawbacks
/clawback                         every loan still inside a lender's window, exposure attached
/reviews-due                      the promised annual reviews, overdue first, book value beside them
/client Whelan                    one client's whole file: loans, deals, reviews, contact, CDD
/deal DL-1016                     one deal: the clocks, the lender log, the advice file
/compliance                       eight rules from the Acts and the Code, run against your records
/weekly-review                    the Monday review, written from three commands
```

One loan part is one row, because a settlement splits into tranches on different fixed terms, and each tranche reaches the refix book on its own date. That date is what the retention business runs on.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No admin-gated export, no lock-in, no migration fee to leave.
- No per-adviser licence, no custom report queue billed by the hour. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/mortgage-broking-for-claude-code.git
cd mortgage-broking-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database, loads Harbourline Mortgages (a demo Auckland firm with three advisers, a nine lender panel, a $7m book, a finance clause due in three days, a fixed rate that lapsed five days ago, a company client with no CDD on a live deal, an unpaid upfront and a clawback), then prints the pipeline, the refix book, the attention list and the compliance check.

Then open the folder in Claude Code and type:

```
/attention
```

Try `/pipeline`, `/rollovers`, `/client Whelan`, `/commissions`, `/compliance`, `/weekly-review`. When you are ready for real data, delete `.data/` and start with `/import`, or add clients one at a time with `add client`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md) so drafts come out in your voice, put your business name and colours in [brand.json](brand.json) so the letters and reports carry your name, and put your aggregator's real commission terms into the lender panel so every expected payment computes right.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee. A team shares one database: each person clones the repo, points at the same `DATABASE_URL`, sets `MB_ADVISER` to their own name, and works in their own Claude Code.

## The commands

| Command | What it does |
|---|---|
| `/pipeline` | Every open deal with both clocks: the finance clause and the pre-approval expiry. |
| `/deal` | One deal in full, or move it. Submitting without CDD on file is refused, with the Act cited. |
| `/settle` | Settlement day: creates the loan parts, computes the expected upfront off the lender's terms, starts the clawback clock, schedules the annual review. |
| `/settlements` | Booked and just landed, with the advice file position on each. |
| `/rollovers` | The refix book, soonest first, with last contact and clawback position beside each expiry. |
| `/client` | One client's whole file. `/book` the whole loan book; `loan <number>` one loan and its ledger. |
| `/lenders` | The panel and its terms: upfront, trail, refix fees, clawback windows, turnaround. All data, all yours to correct. |
| `/commissions` | Upfronts owed and short, trail by month, clawbacks raised. `commission received` reconciles the statement. |
| `/clawback` | Every loan inside a window, straight-line exposure attached, refix dates flagged. |
| `/trail-book` (CLI `trail-book`) | What the book earns per year, by lender. |
| `/reviews-due` | The annual review book, overdue first. `review done` schedules the next one. |
| `/advice-file` | The six records on every deal, what is missing, and how to close each gap. |
| `/compliance` | Eight rules from the Acts and the Code, run against your records, each with its source. |
| `/attention` | Everything that wants a decision this week, worst first. |
| `/weekly-review` | The Monday review, written from three commands. |
| `/draft-refix-letter` | The expiry letter, from the client's whole position. Into `drafts/`. |
| `/draft-review-note` | The review invitation or follow-up, from the file. Into `drafts/`. |
| `/log` | A call, a task, a lender event. The entries every "gone quiet" alarm reads. |
| `/import` | Bring the book across from Trail, Salestrekker, Mercury Nexus or plain CSV. |
| `/customise` | Add a field, rename stages, change a rule, in plain language. Writes and applies the migration. |
| `/new-view` | Add a read-only HTML dashboard from a description. |

Everything the commands do, the CLI does: `npm run mortgage -- help`. Any command takes `--json`.

### Documents and views, in your brand

```bash
npm run docs    # refix letters, annual review packs, settlement summaries, adviser week reports, as HTML
npm run view    # the week and the book, as read-only HTML dashboards
```

Both read [brand.json](brand.json), so your business name, logo and colours are one file away. Documents land in `docs-out/`, views in `views/`. Print either to PDF from the browser. `/new-view` adds a view, `documents.json` adds a document.

## Compliance, checked against the data

`/compliance` runs the rules in [docs/compliance.md](docs/compliance.md) against your records and reports what is breached. Each rule cites its source, and the CLI enforces the sharpest one at the gate: an application cannot be submitted for a client with no customer due diligence on file.

1. Disclosure given when the scope of advice is known (Disclosure Regulations 2020).
2. Fact find and needs analysis on file before advice (Code of Professional Conduct, Standard 3).
3. Affordability and suitability inquiries recorded (CCCFA 2003, s 9C).
4. Customer due diligence before the business relationship (AML/CFT Act 2009, ss 11 to 16).
5. Commission and the clawback fee disclosed to the client (Disclosure Regulations 2020).
6. A record of the advice, kept seven years (FMCA 2013 and FAP Standard Condition 1).
7. The promised ongoing service actually delivered (FMCA fair dealing, and your own disclosure).
8. Every adviser holds an FSP registration (FSP Act 2008).

The Australian equivalents (NCCP Act 2009, the mortgage broker Best Interests Duty in Part 3-5A, ASIC RG 273) are in the same file, at a high level, with the parts to read. Nothing there is legal advice. It is the rule book you point the system at, and you change it to match your jurisdiction and your licence.

## Ten questions Trail cannot answer

Every one of these is answered by the demo data today. Yours will be different, and that is the point.

1. Which fixed rates expire in the next ninety days, what balance rolls with them, and which of those clients has nobody spoken to in a month?
2. Which loans are still inside their lender's clawback window AND have a refix inside it, so losing the client loses the upfront too?
3. Which upfront commissions were never paid, or arrived short against the schedule, and by how much per lender?
4. What is the trail book worth per year by lender, and what leaves if ten percent of it refinances?
5. Which lender eats the most days between submission and approval, and which one declines after eating them?
6. Which referral sources send the deals that actually settle, and at what average size?
7. How many days does each adviser's pipeline sit per stage, and whose applications go quiet?
8. Which settled deals are missing a record of advice or CDD, exactly the list an FMA monitoring visit asks for?
9. Which discharged loans left inside the clawback window, for what stated reason, and how much did each reason cost?
10. If an adviser left tomorrow, which clients, refixes in the next six months, live deals and reviews move with their book?

## Your first hour: ten things to ask for

Open the folder in Claude Code and say these in your own words. Each one changes the system to fit your business.

1. "Put our real aggregator commission schedule into the lender panel, and our clawback windows with it."
2. "Put our logo and colours on the letters, and change the business name to ours."
3. "Our stages are Enquiry, Discovery, Research, Submitted, Approved, Instructed, Settled. Rename them everywhere."
4. "Add a KiwiSaver first-home withdrawal checklist to every purchase deal for a first home buyer."
5. "Track the insurance referral on every settled deal: who we referred to, and whether it was taken."
6. "Warn me at ninety days before a fixed expiry, not sixty. Our conversations start earlier."
7. "Add a rule to `/compliance`: no deal reaches conditional without the commission disclosure on file."
8. "We are in Australia. Rebuild the compliance file on the NCCP and the Best Interests Duty, RG 273."
9. "Build me a page per adviser for Monday: their pipeline, their refixes, their overdue reviews."
10. "Write me a command that drafts the pre-settlement checklist from the deal's file."

`/customise` writes the migration, applies it, updates every command that touches the change, and runs the tests.

## Instead of Trail

Export the contacts and the lending report, run one command, and the book comes with you. Step by step, with what maps and what does not carry over: [docs/replace-trail.md](docs/replace-trail.md).

```bash
npm run mortgage -- import trail --clients=clients.csv --loans=loans.csv --deals=deals.csv --dry-run
npm run mortgage -- import trail --clients=clients.csv --loans=loans.csv --deals=deals.csv
```

Salestrekker and Mercury Nexus exports go through the same command with `salestrekker` or `mercury` in place of `trail`. Anything else works with `csv`.

Every imported client arrives with no CDD date and every imported deal with an empty advice file, deliberately: this system will not call a file complete because the old one never said otherwise. `/compliance` then lists exactly what to backfill.

## Architecture

```
mortgage-broking-for-claude-code/
  CLAUDE.md                              how the business wants this run (routing table + house rules)
  brand.json                             your business name, logo and colours on every document and view
  views.json                             the HTML dashboards npm run view renders
  documents.json                         the paperwork npm run docs renders
  .claude/commands/                      the slash commands
  scripts/mortgage.mjs                   the CLI the commands drive
  scripts/view.mjs                       read-only HTML dashboards from the SQL views
  scripts/docs.mjs                       the documents, one HTML file per record
  scripts/lib/db.mjs                     one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/                   plain SQL schema, tables and views
  supabase/seed.sql                      demo data
  docs/compliance.md                     the rules /compliance checks, each with its source
  docs/replace-trail.md                  moving off the incumbent
  docs/why-no-front-end.md               the honest trade-offs
  exports/                               whole database dumps
  drafts/                                letters and notes written for a person to send
```

## Built with Claude Code

This repository was built with Claude Code as the primary development tool, from the schema to the commands, and it is meant to be extended the same way. Ask for a new command and it writes one.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end, no client money, and nothing that submits to a lender.

## Want it installed and run for you?

Enterprise DNA installs Mortgage Broking for Claude Code for your business, migrates your Trail data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: https://calendly.com/sam-mckay/discovery-call
- Read more: https://enterprisedna.co/omni/instead-of/trail

## License

MIT. Copyright (c) 2026 Enterprise DNA.
