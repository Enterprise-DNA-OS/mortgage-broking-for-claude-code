# The rules a mortgage advice business lives under

This file is the rule book `/compliance` checks the database against. Each rule has a name, the
source it comes from, what a breach looks like in the data, the query that finds it and the command
that fixes the record. `npm run mortgage -- compliance` runs all of them, and
`npm run mortgage -- compliance <key>` runs one.

Nothing here is legal advice. These are the rules the business has told this system to enforce.
Read them, change them to match your own licence conditions and your own aggregator agreements, and
keep the sources current. When a rule changes, change the rule and the check together.

The sources are New Zealand first, because that is where the reference business is. The Australian
equivalents are at the bottom, at a high level, with the acts to read.

## What this system does not do

**Nobody's money is in here and nothing submits to a lender.** A mortgage adviser does not hold
client funds; the lender pays the aggregator, the aggregator pays the business, and both keep their
own ledgers. What this database holds is the record the regulator actually asks about: who the
clients are and when their identity was verified, what advice was given and where the evidence
sits, what was recommended and what settled, and whether the promised ongoing service happened. The
commission ledger records what was expected against what arrived so the reconciliation maths works.
It never moves a cent, and it never lodges an application; the lender's own channel does that.

The six advice records this system creates on every deal, all of them born "missing":

| Record | Source |
|---|---|
| scope of service disclosure | Disclosure Regulations 2020 |
| fact find and needs analysis | Code of Professional Conduct, Standard 3 |
| affordability and suitability evidence | CCCFA 2003, s 9C |
| AML/CFT customer due diligence | AML/CFT Act 2009, ss 11 to 16 |
| commission and clawback disclosure | Disclosure Regulations 2020 |
| record of advice | FMCA 2013 and FAP Standard Condition 1 |

---

## 1. Disclosure given when the scope of advice is known (`disclosure`)

**Source.** Financial Markets Conduct (Regulated Financial Advice Disclosure) Amendment Regulations
2020, made under the FMC Act 2013 as amended by the Financial Services Legislation Amendment Act
2019. Disclosure happens at set points in the advice process, starting when the nature and scope of
the advice is known, plus standing website disclosure.

**What it means for an adviser.** Before the advice conversation gets real, the client knows who is
advising them, under whose licence, what it covers and how the adviser is paid. In practice the
scope-of-service document goes out at or before the fact find.

**Breach in the data.** A deal at or past application whose scope of service disclosure record is
still missing.

```sql
select d.ref, c.name, d.stage from advice_records ar
join deals d on d.id = ar.deal_id join clients c on c.id = d.client_id
where ar.kind = 'scope of service disclosure' and ar.status = 'missing'
  and d.stage in ('application','conditional','unconditional','instructed','settled');
```

**Command.** `advice <deal> "scope" --on=<date it was given>`.

---

## 2. Fact find and needs analysis before advice (`suitability`)

**Source.** Code of Professional Conduct for Financial Advice Services, Standard 3: the advice must
be suitable for the client. Suitability cannot be shown without a record of the client's situation,
needs and objectives.

**What it means for an adviser.** The fact find is the foundation document of every file. No fact
find, no demonstrable suitability, no defensible advice.

**Breach in the data.** A deal at or past application with no fact find on file.

**Command.** `advice <deal> "fact find" --on=`.

---

## 3. Affordability and suitability inquiries recorded (`affordability`)

**Source.** Credit Contracts and Consumer Finance Act 2003, s 9C: lender responsibility principles,
including reasonable inquiries into the borrower's requirements, objectives and ability to repay.
The lender carries the statutory duty; the adviser assembles the evidence the application stands
on, and a file that cannot show the servicing position is a file that cannot defend the
recommendation.

**Breach in the data.** A deal at or past application with no affordability evidence on file.

**Command.** `advice <deal> "affordability" --on=`.

---

## 4. Customer due diligence before the business relationship (`cdd`)

**Source.** Anti-Money Laundering and Countering Financing of Terrorism Act 2009, ss 11 to 16. A
business that arranges home loans for clients through lenders is ordinarily a reporting entity, and
CDD happens before the business relationship is established. Companies and trusts need enhanced
CDD; from June 2025 a customer risk rating is recorded and maintained too.

**What it means for an adviser.** Identity is verified before the application goes anywhere, not
after settlement in a tidy-up. The CLI enforces this at the gate: `deal stage <ref> application` is
refused while the client's CDD date is empty.

**Breach in the data.** A submitted deal whose client has no CDD date.

```sql
select d.ref, c.name, d.stage from deals d join clients c on c.id = d.client_id
where d.stage in ('application','conditional','unconditional','instructed','settled')
  and c.cdd_completed_on is null;
```

**Command.** `cdd <client> --on= --type=standard|enhanced`. The identity documents live where your
AML programme says; this records that the work happened and when.

---

## 5. Commission and clawback fee disclosed (`commission-disclosure`)

**Source.** The Disclosure Regulations 2020 again: commission, incentives and any fees the client
may have to pay must be disclosed, and a clawback-recovery fee charged when a client repays early
is exactly such a fee. Disputes schemes publish guidance on clawback fees because this is where
complaints happen.

**Breach in the data.** A deal at or past application with no commission and clawback disclosure on
file.

**Command.** `advice <deal> "clawback" --on=`.

---

## 6. A record of the advice, kept seven years (`record-of-advice`)

**Source.** FMC Act 2013 and FAP licence Standard Condition 1: adequate records of the financial
advice service, created in a timely manner and kept at least seven years, sufficient to demonstrate
compliance with the Act, the regulations and the Code.

**What it means for an adviser.** The record of advice is written when the advice is given, before
the application if possible and never after settlement. A file reconstructed months later is a
record of memory, not of advice.

**Breach in the data.** A deal at unconditional or later with no record of advice on file. The
attention list flags it earlier, from application.

**Command.** `advice <deal> "record of advice" --on=`.

---

## 7. The promised ongoing service is delivered (`reviews`)

**Source.** The business's own disclosure. When the service described to the client includes an
annual review, fair dealing under the FMC Act 2013 (Part 2: no misleading or deceptive conduct)
makes delivering it a conduct matter, not a courtesy. The FMA's regulatory returns ask about
ongoing service for a reason.

**Breach in the data.** An open review past its due date for an active client.

```sql
select r.client, r.due_on, r.days_overdue from v_reviews_due r
where r.completed_on is null and r.due_on < current_date;
```

**Command.** `review done <client> --on=` after it happens; `review schedule <client> --due=` for a
client taken on mid-cycle. Settlement schedules the first one automatically.

---

## 8. Every adviser holds an FSP registration (`fsp`)

**Source.** Financial Service Providers (Registration and Dispute Resolution) Act 2008: anyone in
the business of providing a financial service is registered on the FSPR, and financial advisers
giving regulated advice are engaged by a licensed FAP.

**Breach in the data.** An active adviser with no FSP number recorded.

**Command.** Record it on the adviser. `add adviser` takes `--fsp=`.

---

## The Australian equivalents, at a high level

The same shape of obligations exists across the Tasman under different names. If this system runs
an Australian broking business, rebuild this file on these and change the checks with it:

- **National Consumer Credit Protection Act 2009 (Cth).** The licensing regime (ACL), responsible
  lending, and since 1 January 2021 the mortgage broker **Best Interests Duty** in Part 3-5A:
  brokers must act in the best interests of the consumer and prioritise the consumer's interests,
  with ASIC's RG 273 as the guidance. BID replaces the Code-suitability framing of rules 2 and 3.
- **AML/CTF Act 2006 (Cth)** for customer identification, the counterpart of rule 4.
- **NCCP disclosure obligations** (credit guide, credit proposal) as the counterpart of rules 1
  and 5, including commission disclosure.
- **ASIC record-keeping requirements** under the ACL as the counterpart of rule 6.

The stages, the refix book, the clawback windows and the commission ledger work unchanged; only the
rule book and its citations move.
