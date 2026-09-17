-- mortgage-broking-for-claude-code: core schema.
-- A mortgage advice business: the advisers and their FSP numbers, the clients
-- and the AML/CFT due diligence behind each one, the lenders and their
-- commission and clawback terms, the deal pipeline from lead to settlement with
-- the finance clause clock on it, the advice file every deal must carry, the
-- loan book with its fixed rate expiry dates, the commission ledger (upfront,
-- trail, clawback), the annual review book, tasks and the contact log.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
--
-- Money is stored in cents and it is a RECORD, not a bank balance. Client money
-- never touches a mortgage adviser and it never touches this database. The
-- commission ledger records what a lender or aggregator owes and what arrived,
-- so the reconciliation maths works. Interest rates are stored in basis points
-- (628 means 6.28 percent) so the arithmetic is integer arithmetic.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Whole months between two dates, the unit lender clawback schedules are
-- written in. Eight months and twenty days is eight months.
create or replace function months_between(d1 date, d2 date) returns integer
language sql immutable as $$
  select (extract(year from age(d2, d1)) * 12 + extract(month from age(d2, d1)))::integer
$$;

-- Advisers -------------------------------------------------------------------
-- The financial advisers at the business. fsp_number is the adviser's entry on
-- the Financial Service Providers Register; every adviser giving regulated
-- advice has one, and /compliance flags anyone without one on file.

create table if not exists advisers (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  code          text,
  email         text,
  phone         text,
  fsp_number    text,
  role          text not null default 'mortgage adviser',
  active        boolean not null default true,
  started_on    date,
  external_ref  text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists advisers_name_lower_idx on advisers (lower(full_name));

-- Clients --------------------------------------------------------------------
-- One client is one borrowing household or entity: a person, a couple, a
-- company or a trust. cdd_completed_on is the AML/CFT customer due diligence
-- date; the AML/CFT Act 2009 requires it before the business relationship is
-- established, and the CLI refuses to submit an application without it.

create table if not exists clients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  client_type       text not null default 'individual',   -- individual | couple | company | trust
  email             text,
  phone             text,
  city              text,
  referred_by       text,
  adviser_id        uuid references advisers(id) on delete set null,
  status            text not null default 'active',        -- active | former
  cdd_completed_on  date,
  cdd_type          text,                                   -- standard | enhanced
  service_level     text not null default 'annual review',  -- what ongoing service was promised
  external_ref      text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists clients_name_lower_idx on clients (lower(name));

-- Lenders --------------------------------------------------------------------
-- The panel. Commission and clawback terms live HERE as data, not in anyone's
-- head: upfront_rate_bps and trail_rate_bps drive the expected commission on a
-- settlement, clawback_months drives the exposure window when a loan
-- discharges early. The seeded numbers are demo values. Put your own
-- aggregator schedule in and the whole book recalculates.

create table if not exists lenders (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  code              text,
  kind              text not null default 'bank',            -- bank | non-bank
  upfront_rate_bps  integer not null default 85,             -- 85 = 0.85% of drawn amount
  trail_rate_bps    integer not null default 0,              -- per year, on balance
  refix_fee_cents   integer not null default 0,              -- what the lender pays per refix
  clawback_months   integer not null default 24,             -- full schedule in clawback_note
  clawback_note     text,
  turnaround_days   integer,                                  -- typical days to assessment
  bdm_name          text,
  bdm_email         text,
  active            boolean not null default true,
  external_ref      text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Deals ----------------------------------------------------------------------
-- The pipeline. One deal is one lending scenario for one client, and it moves
-- through the stages a broking business already uses. The dates carry the two
-- clocks the week runs on: finance_due_on (the finance clause on a sale and
-- purchase agreement) and preapproval_expires_on. stage_since makes "how long
-- has this sat here" a subtraction, not a memory.

create table if not exists deals (
  id                      uuid primary key default gen_random_uuid(),
  ref                     text unique,
  client_id               uuid not null references clients(id) on delete cascade,
  adviser_id              uuid references advisers(id) on delete set null,
  lender_id               uuid references lenders(id) on delete set null,
  purpose                 text not null default 'purchase',  -- purchase | refinance | top-up | construction | investment
  stage                   text not null default 'lead',      -- lead | fact-find | pre-approval | application | conditional | unconditional | instructed | settled | declined | withdrawn
  stage_since             date not null default current_date,
  amount_cents            bigint not null default 0,
  security_address        text,
  security_value_cents    bigint,
  opened_on               date not null default current_date,
  fact_find_on            date,
  submitted_on            date,
  preapproval_expires_on  date,
  finance_due_on          date,
  approved_on             date,
  unconditional_on        date,
  settlement_on           date,       -- booked
  settled_on              date,       -- happened
  declined_on             date,
  declined_reason         text,
  withdrawn_on            date,
  note                    text,
  external_ref            text unique,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists deals_stage_idx on deals (stage);
create index if not exists deals_client_idx on deals (client_id);

-- Every stage move, submission, lender phone call and decision, in order. The
-- pipeline is only as honest as this log.
create table if not exists deal_events (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals(id) on delete cascade,
  noted_on    date not null default current_date,
  event       text not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists deal_events_deal_idx on deal_events (deal_id);

-- The advice file ------------------------------------------------------------
-- The records the regulator expects on every advised deal, created as
-- "missing" the day the deal opens, because this system will not call a file
-- complete on no evidence. Each kind cites its source. /compliance reads this
-- table; so does the FMA when it visits.

create table if not exists advice_records (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals(id) on delete cascade,
  kind        text not null,
  status      text not null default 'missing',   -- missing | on file | n/a
  done_on     date,
  standard    text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (deal_id, kind)
);

-- Loans ----------------------------------------------------------------------
-- The book. One row is one loan part, because a settlement is usually split
-- into tranches on different fixed terms. fixed_until is the date the whole
-- retention business runs on: when it passes, the loan rolls to the lender's
-- floating rate and the client starts shopping.

create table if not exists loans (
  id                uuid primary key default gen_random_uuid(),
  loan_number       text unique,
  deal_id           uuid references deals(id) on delete set null,
  client_id         uuid not null references clients(id) on delete cascade,
  adviser_id        uuid references advisers(id) on delete set null,
  lender_id         uuid not null references lenders(id),
  drawn_on          date not null,
  amount_cents      bigint not null,
  balance_cents     bigint not null,
  rate_bps          integer not null,
  rate_type         text not null default 'fixed',     -- fixed | floating
  fixed_until       date,
  term_months       integer not null default 360,
  repayment         text not null default 'principal and interest',
  status            text not null default 'active',    -- active | discharged
  discharged_on     date,
  discharge_reason  text,
  external_ref      text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists loans_client_idx on loans (client_id);
create index if not exists loans_lender_idx on loans (lender_id);

-- Commission -----------------------------------------------------------------
-- What the lender or aggregator owes and what arrived. kind 'upfront' is
-- expected on settlement, 'trail' rows record the monthly statement as it is
-- reconciled, 'clawback' rows are negative and carry the reason. This is a
-- reconciliation record: the actual money lands in the business bank account,
-- never here.

create table if not exists commission_entries (
  id              uuid primary key default gen_random_uuid(),
  loan_id         uuid not null references loans(id) on delete cascade,
  kind            text not null default 'upfront',   -- upfront | trail | clawback | refix fee
  period_month    date,                               -- first of the month, for trail
  expected_cents  bigint not null default 0,
  received_cents  bigint,
  received_on     date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists commission_loan_idx on commission_entries (loan_id);

-- Reviews --------------------------------------------------------------------
-- The ongoing service the client was promised. An annual review that never
-- happens is a conduct problem and a retention problem at the same time.

create table if not exists reviews (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  kind          text not null default 'annual review',
  due_on        date not null,
  completed_on  date,
  adviser_id    uuid references advisers(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists reviews_client_idx on reviews (client_id);

-- Tasks and the contact log ---------------------------------------------------

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  client_id   uuid references clients(id) on delete cascade,
  deal_id     uuid references deals(id) on delete cascade,
  adviser_id  uuid references advisers(id) on delete set null,
  due_on      date,
  status      text not null default 'open',   -- open | done
  done_on     date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists contact_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  deal_id     uuid references deals(id) on delete set null,
  adviser_id  uuid references advisers(id) on delete set null,
  noted_on    date not null default current_date,
  channel     text not null default 'phone',   -- phone | email | meeting | text
  note        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists contact_notes_client_idx on contact_notes (client_id);

-- updated_at triggers ---------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['advisers','clients','lenders','deals','advice_records','loans','commission_entries','reviews','tasks']
  loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
  end loop;
end
$$;

-- =============================================================================
-- Views: the questions the business asks every week, as SQL it can read.
-- =============================================================================

-- The pipeline, one row per open deal, with both clocks on it.
create or replace view v_pipeline as
select
  d.id as deal_id,
  d.ref,
  c.name as client,
  c.id as client_id,
  coalesce(a.full_name, 'unassigned') as adviser,
  coalesce(l.name, 'no lender yet') as lender,
  d.purpose,
  d.stage,
  d.stage_since,
  (current_date - d.stage_since) as days_in_stage,
  (current_date - d.opened_on) as days_open,
  d.amount_cents,
  d.security_address,
  d.finance_due_on,
  (d.finance_due_on - current_date) as days_to_finance,
  d.preapproval_expires_on,
  (d.preapproval_expires_on - current_date) as days_to_preapproval_expiry,
  d.settlement_on,
  d.submitted_on,
  c.cdd_completed_on,
  (select count(*) from advice_records ar where ar.deal_id = d.id and ar.status = 'missing') as file_gaps
from deals d
join clients c on c.id = d.client_id
left join advisers a on a.id = d.adviser_id
left join lenders l on l.id = d.lender_id
where d.stage not in ('settled', 'declined', 'withdrawn');

-- The loan book with the refix and clawback arithmetic done.
create or replace view v_loan_book as
select
  ln.id as loan_id,
  ln.loan_number,
  c.name as client,
  c.id as client_id,
  coalesce(a.full_name, 'unassigned') as adviser,
  l.name as lender,
  l.id as lender_id,
  ln.drawn_on,
  ln.amount_cents,
  ln.balance_cents,
  ln.rate_bps,
  ln.rate_type,
  ln.fixed_until,
  (ln.fixed_until - current_date) as days_to_refix,
  ln.term_months,
  ln.repayment,
  ln.status,
  ln.discharged_on,
  months_between(ln.drawn_on, current_date) as months_on_book,
  l.clawback_months,
  (months_between(ln.drawn_on, current_date) < l.clawback_months and ln.status = 'active') as in_clawback_window,
  (l.clawback_months - months_between(ln.drawn_on, current_date)) as clawback_months_left,
  round(ln.balance_cents * l.trail_rate_bps / 10000.0) as trail_cents_per_year,
  (select coalesce(sum(ce.received_cents), 0) from commission_entries ce
     where ce.loan_id = ln.id and ce.kind = 'upfront') as upfront_received_cents,
  (select max(cn.noted_on) from contact_notes cn where cn.client_id = c.id) as last_contact_on
from loans ln
join clients c on c.id = ln.client_id
join lenders l on l.id = ln.lender_id
left join advisers a on a.id = ln.adviser_id;

-- The refix book: every active fixed loan, soonest expiry first. This is the
-- retention business. A fixed rate that expires unwatched rolls the client to
-- floating and out into a competitor's cashback offer.
create or replace view v_rollovers as
select *,
  case
    when days_to_refix < 0 then 'LAPSED'
    when days_to_refix <= 30 then 'this month'
    when days_to_refix <= 60 then 'inside 60 days'
    when days_to_refix <= 90 then 'inside 90 days'
    else 'later'
  end as refix_window,
  (current_date - last_contact_on) as days_since_contact
from v_loan_book
where status = 'active' and rate_type = 'fixed' and fixed_until is not null
order by fixed_until;

-- Annual reviews: the promised one per client, latest first, with the gap.
create or replace view v_reviews_due as
select
  c.id as client_id,
  c.name as client,
  coalesce(a.full_name, 'unassigned') as adviser,
  r.id as review_id,
  r.kind,
  r.due_on,
  r.completed_on,
  (current_date - r.due_on) as days_overdue,
  (select max(cn.noted_on) from contact_notes cn where cn.client_id = c.id) as last_contact_on,
  (select coalesce(sum(ln.balance_cents), 0) from loans ln where ln.client_id = c.id and ln.status = 'active') as book_cents
from reviews r
join clients c on c.id = r.client_id
left join advisers a on a.id = c.adviser_id
where c.status = 'active';

-- Commission position: what settlements are still owed, what trail arrived.
create or replace view v_commission_position as
select
  ce.id,
  ce.kind,
  ce.period_month,
  ce.expected_cents,
  ce.received_cents,
  ce.received_on,
  (ce.received_cents is null and ce.kind in ('upfront', 'trail')) as outstanding,
  (coalesce(ce.received_cents, 0) - ce.expected_cents) as variance_cents,
  ce.note,
  ln.loan_number,
  ln.drawn_on,
  (current_date - ln.drawn_on) as days_since_drawn,
  c.name as client,
  l.name as lender,
  coalesce(a.full_name, 'unassigned') as adviser
from commission_entries ce
join loans ln on ln.id = ce.loan_id
join clients c on c.id = ln.client_id
join lenders l on l.id = ln.lender_id
left join advisers a on a.id = ln.adviser_id;

-- Clawback: every active loan still inside its lender's window, and every
-- discharge that landed inside one. Exposure is straight-line across the
-- window, which is an estimate: the lender's own schedule is the number that
-- counts, and it lives in lenders.clawback_note.
create or replace view v_clawback as
select
  b.loan_id,
  b.loan_number,
  b.client,
  b.adviser,
  b.lender,
  b.drawn_on,
  b.status,
  b.discharged_on,
  b.months_on_book,
  b.clawback_months,
  b.clawback_months_left,
  b.upfront_received_cents,
  case when b.clawback_months > 0
    then round(b.upfront_received_cents * greatest(0, b.clawback_months_left)::numeric / b.clawback_months)
    else 0 end as exposure_cents,
  b.fixed_until,
  b.days_to_refix
from v_loan_book b
where b.upfront_received_cents > 0
  and (b.in_clawback_window
       or (b.status = 'discharged' and months_between(b.drawn_on, coalesce(b.discharged_on, current_date)) < b.clawback_months));

-- The advice file gaps that matter: a deal at or past submission with records
-- missing. This is what an FMA monitoring visit reads first.
create or replace view v_advice_gaps as
select
  d.ref,
  c.name as client,
  coalesce(a.full_name, 'unassigned') as adviser,
  d.stage,
  d.submitted_on,
  d.settled_on,
  ar.kind as missing_record,
  ar.standard
from advice_records ar
join deals d on d.id = ar.deal_id
join clients c on c.id = d.client_id
left join advisers a on a.id = d.adviser_id
where ar.status = 'missing'
  and d.stage in ('application', 'conditional', 'unconditional', 'instructed', 'settled');

-- One client, one line: the whole relationship.
create or replace view v_client_position as
select
  c.id as client_id,
  c.name as client,
  c.client_type,
  c.status,
  coalesce(a.full_name, 'unassigned') as adviser,
  c.cdd_completed_on,
  (select count(*) from loans ln where ln.client_id = c.id and ln.status = 'active') as active_loans,
  (select coalesce(sum(ln.balance_cents), 0) from loans ln where ln.client_id = c.id and ln.status = 'active') as book_cents,
  (select min(ln.fixed_until) from loans ln where ln.client_id = c.id and ln.status = 'active' and ln.rate_type = 'fixed' and ln.fixed_until >= current_date) as next_refix_on,
  (select count(*) from deals d where d.client_id = c.id and d.stage not in ('settled', 'declined', 'withdrawn')) as open_deals,
  (select max(cn.noted_on) from contact_notes cn where cn.client_id = c.id) as last_contact_on,
  (current_date - (select max(cn.noted_on) from contact_notes cn where cn.client_id = c.id)) as days_since_contact,
  (select min(r.due_on) from reviews r where r.client_id = c.id and r.completed_on is null) as next_review_due
from clients c
left join advisers a on a.id = c.adviser_id;

-- Settlements booked or just landed.
create or replace view v_settlements as
select
  d.ref,
  c.name as client,
  coalesce(a.full_name, 'unassigned') as adviser,
  coalesce(l.name, '') as lender,
  d.stage,
  d.amount_cents,
  d.security_address,
  d.settlement_on,
  d.settled_on,
  (d.settlement_on - current_date) as days_to_settlement,
  (select count(*) from advice_records ar where ar.deal_id = d.id and ar.status = 'missing') as file_gaps
from deals d
join clients c on c.id = d.client_id
left join advisers a on a.id = d.adviser_id
left join lenders l on l.id = d.lender_id
where (d.stage in ('unconditional', 'instructed') and d.settlement_on is not null)
   or (d.stage = 'settled' and d.settled_on >= current_date - 30);

-- Everything that wants a decision, one union, worst first. The reasons are
-- the ones a broking principal actually loses sleep over.
create or replace view v_attention as
-- A finance clause due inside five days on a deal that is not unconditional.
select 'finance_due' as reason, d.ref as label, c.name as client, coalesce(a.full_name, '') as adviser,
       (d.finance_due_on - current_date) as days, d.amount_cents,
       'finance clause ' || to_char(d.finance_due_on, 'YYYY-MM-DD') || ', deal at ' || d.stage as detail
from deals d join clients c on c.id = d.client_id left join advisers a on a.id = d.adviser_id
where d.stage in ('application', 'conditional') and d.finance_due_on is not null
  and d.finance_due_on - current_date <= 5
union all
-- A pre-approval expiring inside fourteen days.
select 'preapproval_expiring', d.ref, c.name, coalesce(a.full_name, ''),
       (d.preapproval_expires_on - current_date), d.amount_cents,
       'pre-approval expires ' || to_char(d.preapproval_expires_on, 'YYYY-MM-DD')
from deals d join clients c on c.id = d.client_id left join advisers a on a.id = d.adviser_id
where d.stage = 'pre-approval' and d.preapproval_expires_on is not null
  and d.preapproval_expires_on - current_date <= 14
union all
-- An application sitting at a lender with nothing logged for ten days.
select 'application_quiet', d.ref, c.name, coalesce(a.full_name, ''),
       (current_date - greatest(d.stage_since, coalesce((select max(e.noted_on) from deal_events e where e.deal_id = d.id), d.stage_since))),
       d.amount_cents,
       'at ' || coalesce(l.name, 'lender') || ' since ' || to_char(d.submitted_on, 'YYYY-MM-DD') || ', nothing logged for 10+ days'
from deals d join clients c on c.id = d.client_id
left join advisers a on a.id = d.adviser_id left join lenders l on l.id = d.lender_id
where d.stage in ('application', 'conditional')
  and greatest(d.stage_since, coalesce((select max(e.noted_on) from deal_events e where e.deal_id = d.id), d.stage_since)) <= current_date - 10
union all
-- A fixed rate that has already lapsed: the client is on floating right now.
select 'refix_lapsed', b.loan_number, b.client, b.adviser,
       (current_date - b.fixed_until), b.balance_cents,
       'fixed rate ended ' || to_char(b.fixed_until, 'YYYY-MM-DD') || ', still recorded fixed'
from v_loan_book b
where b.status = 'active' and b.rate_type = 'fixed' and b.fixed_until < current_date
union all
-- A fixed rate expiring inside sixty days with no client contact in thirty.
select 'refix_due', b.loan_number, b.client, b.adviser,
       (b.fixed_until - current_date), b.balance_cents,
       'fixed ends ' || to_char(b.fixed_until, 'YYYY-MM-DD') ||
       case when b.last_contact_on is null then ', client never contacted'
            else ', last contact ' || to_char(b.last_contact_on, 'YYYY-MM-DD') end
from v_loan_book b
where b.status = 'active' and b.rate_type = 'fixed'
  and b.fixed_until between current_date and current_date + 60
  and (b.last_contact_on is null or b.last_contact_on <= current_date - 30)
union all
-- An annual review past its date.
select 'review_overdue', r.client, r.client, r.adviser,
       r.days_overdue, r.book_cents,
       r.kind || ' due ' || to_char(r.due_on, 'YYYY-MM-DD')
from v_reviews_due r
where r.completed_on is null and r.due_on < current_date
union all
-- An upfront commission still unpaid thirty days after drawdown.
select 'upfront_unpaid', p.loan_number, p.client, p.adviser,
       p.days_since_drawn, p.expected_cents,
       'settled ' || to_char(p.drawn_on, 'YYYY-MM-DD') || ', ' || p.lender || ' upfront not received'
from v_commission_position p
where p.kind = 'upfront' and p.received_cents is null and p.days_since_drawn >= 30
union all
-- A commission that arrived short.
select 'commission_short', p.loan_number, p.client, p.adviser,
       (current_date - p.received_on), abs(p.variance_cents),
       p.kind || ' from ' || p.lender || ' short by ' || to_char(abs(p.variance_cents) / 100.0, 'FM$999,999,990')
from v_commission_position p
where p.received_cents is not null and p.variance_cents < 0
union all
-- A discharge inside the clawback window.
select 'clawback', cb.loan_number, cb.client, cb.adviser,
       months_between(cb.drawn_on, cb.discharged_on), cb.upfront_received_cents,
       'discharged at month ' || months_between(cb.drawn_on, cb.discharged_on) || ' of a ' || cb.clawback_months || ' month window at ' || cb.lender
from v_clawback cb
where cb.status = 'discharged'
union all
-- An advice record missing on a deal at or past submission.
select 'advice_gap', g.ref, g.client, g.adviser,
       null::integer, null::bigint,
       g.stage || ' deal missing: ' || g.missing_record
from v_advice_gaps g
union all
-- An application submitted with no AML/CFT due diligence on the client.
select 'cdd_missing', d.ref, c.name, coalesce(a.full_name, ''),
       (current_date - d.submitted_on), d.amount_cents,
       'submitted ' || to_char(d.submitted_on, 'YYYY-MM-DD') || ' with no CDD on file (AML/CFT Act 2009)'
from deals d join clients c on c.id = d.client_id left join advisers a on a.id = d.adviser_id
where d.stage in ('application', 'conditional', 'unconditional', 'instructed', 'settled')
  and c.cdd_completed_on is null
union all
-- A settlement booked inside seven days.
select 'settlement_week', s.ref, s.client, s.adviser,
       s.days_to_settlement, s.amount_cents,
       'settles ' || to_char(s.settlement_on, 'YYYY-MM-DD') || ' (' || s.stage || ')' ||
       case when s.file_gaps > 0 then ', advice file gaps: ' || s.file_gaps else '' end
from v_settlements s
where s.settled_on is null and s.days_to_settlement between 0 and 7
union all
-- A client with money on the book nobody has spoken to in ninety days.
select 'client_quiet', p.client, p.client, p.adviser,
       p.days_since_contact, p.book_cents,
       case when p.last_contact_on is null then 'no contact ever recorded'
            else 'last contact ' || to_char(p.last_contact_on, 'YYYY-MM-DD') end
from v_client_position p
where p.status = 'active' and p.active_loans > 0
  and (p.last_contact_on is null or p.days_since_contact > 90)
union all
-- A task past its date.
select 'task_overdue', t.title, coalesce(c.name, ''), coalesce(a.full_name, ''),
       (current_date - t.due_on), null::bigint,
       'due ' || to_char(t.due_on, 'YYYY-MM-DD')
from tasks t left join clients c on c.id = t.client_id left join advisers a on a.id = t.adviser_id
where t.status = 'open' and t.due_on < current_date;
