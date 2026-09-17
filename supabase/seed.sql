-- Demo data for mortgage-broking-for-claude-code.
-- Harbourline Mortgages, a fictional Auckland advice firm: 3 advisers, a panel
-- of 9 lenders, 24 clients, a pipeline from lead to settlement, a $9m loan
-- book with a refix season coming, commission at every state (expected, paid,
-- short, clawed back) and an annual review book with holes in it.
--
-- Deliberately messy, so the attention list has something to say:
--   a finance clause due in three days on a deal the lender has not approved
--   a pre-approval expiring in nine days while the client is still bidding
--   an application sitting at a lender for twelve days with nothing logged
--   a fixed rate that lapsed five days ago and nobody noticed: the client is
--     paying the floating rate right now
--   a $480,000 fixed rate ending in 47 days for a client nobody has spoken to
--     in over three months
--   a settlement in three days whose advice file is missing the record of advice
--   a company client at conditional approval with no AML/CFT due diligence on file
--   an upfront commission 45 days after settlement, still not received
--   an upfront that arrived $500 short and was never queried
--   a loan discharged at month eight of a 27 month clawback window
--   annual reviews 118 and 35 days overdue
--   two tasks past their date
--
-- Dates are relative to current_date. Ids are derived from names with
-- seed_uuid, and every insert is ON CONFLICT DO NOTHING, so running it twice
-- changes nothing.
--
-- Commission rates and clawback windows here are DEMO VALUES, not any real
-- lender's schedule. Your aggregator agreement is the source of truth; put its
-- numbers into the lenders table and the whole book recalculates.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

-- Advisers --------------------------------------------------------------------

insert into advisers (id, full_name, code, email, phone, fsp_number, role, active, started_on) values
  (seed_uuid('adviser:rachel'), 'Rachel Ng',    'RN', 'rachel@harbourline.example.nz', '021 555 0141', 'FSP701234', 'principal and financial adviser', true, current_date - 2900),
  (seed_uuid('adviser:mere'),   'Mere Kaawa',   'MK', 'mere@harbourline.example.nz',   '021 555 0176', 'FSP712880', 'mortgage adviser',                true, current_date - 1500),
  (seed_uuid('adviser:daniel'), 'Daniel Field', 'DF', 'daniel@harbourline.example.nz', '021 555 0102', 'FSP730417', 'mortgage adviser',                true, current_date - 700)
on conflict do nothing;

-- Lenders ---------------------------------------------------------------------
-- upfront_rate_bps and trail_rate_bps are per the aggregator schedule; 85 means
-- 0.85% of the drawn amount. clawback_months is the window; the straight-line
-- exposure in /clawback is an estimate and the note carries the real schedule.

insert into lenders (id, name, code, kind, upfront_rate_bps, trail_rate_bps, refix_fee_cents, clawback_months, clawback_note, turnaround_days, bdm_name) values
  (seed_uuid('lender:anz'),      'ANZ',            'ANZ', 'bank',     85, 0,  15000, 27, 'Demo terms from industry commentary (0.85% upfront, $150 per refix). Your agreement governs; banks keep the clawback schedule in it.', 7,  'Steve Corbett'),
  (seed_uuid('lender:asb'),      'ASB',            'ASB', 'bank',     85, 0,  15000, 28, 'Demo terms from industry commentary (0.85% upfront, $150 per refix). Your agreement governs.',                                          5,  'Lisa Maru'),
  (seed_uuid('lender:bnz'),      'BNZ',            'BNZ', 'bank',     55, 15, 0,     24, 'Demo terms from industry commentary (0.55% upfront, 0.15% trail). Your agreement governs.',                                            8,  'Priyanka Chand'),
  (seed_uuid('lender:westpac'),  'Westpac',        'WBC', 'bank',     90, 0,  0,     24, 'Demo terms from industry commentary (0.90% upfront, no trail from June 2026). Your agreement governs.',                                9,  'Grant Ilott'),
  (seed_uuid('lender:kiwibank'), 'Kiwibank',       'KWB', 'bank',     55, 15, 0,     27, 'Demo terms from industry commentary (0.55% upfront, 0.15% trail). Your agreement governs.',                                            11, 'Sione Havili'),
  (seed_uuid('lender:tsb'),      'TSB',            'TSB', 'bank',     85, 0,  0,     24, 'Demo terms from industry commentary (0.85% upfront). Your agreement governs.',                                                         10, 'Anna Reid'),
  (seed_uuid('lender:resimac'),  'Resimac',        'RSM', 'non-bank', 65, 25, 0,     24, 'Demo values. Your aggregator schedule governs.',                                                                                        4,  'Mark Delaney'),
  (seed_uuid('lender:pepper'),   'Pepper Money',   'PEP', 'non-bank', 65, 25, 0,     24, 'Demo values. Your aggregator schedule governs.',                                                                                        4,  'Jo Hartman'),
  (seed_uuid('lender:avanti'),   'Avanti Finance', 'AVF', 'non-bank', 80, 15, 0,     18, 'Demo values. Your aggregator schedule governs.',                                                                                        3,  'Tim Fa''avae')
on conflict do nothing;

-- Clients ---------------------------------------------------------------------

insert into clients (id, name, client_type, email, phone, city, referred_by, adviser_id, status, cdd_completed_on, cdd_type, external_ref) values
  (seed_uuid('client:whelan'),    'Tom & Aria Whelan',          'couple',     'whelans@example.nz',      '021 400 011', 'Auckland',  'existing client',        seed_uuid('adviser:mere'),   'active', current_date - 1400, 'standard', 'TRL-3001'),
  (seed_uuid('client:patel'),     'Priya & Sanjay Patel',       'couple',     'patels@example.nz',       '021 400 023', 'Auckland',  'Harcourts Mt Eden',      seed_uuid('adviser:rachel'), 'active', current_date - 60,   'standard', 'TRL-3002'),
  (seed_uuid('client:boyd'),      'Marcus Boyd',                'individual', 'm.boyd@example.nz',       '021 400 034', 'Auckland',  'Google search',          seed_uuid('adviser:daniel'), 'active', current_date - 85,   'standard', 'TRL-3003'),
  (seed_uuid('client:tuilagi'),   'Kelly & Sione Tuilagi',      'couple',     'tuilagis@example.nz',     '021 400 045', 'Manukau',   'existing client referral', seed_uuid('adviser:mere'), 'active', current_date - 40,   'standard', 'TRL-3004'),
  (seed_uuid('client:blackwood'), 'Blackwood Joinery Ltd',      'company',    'accounts@blackwood.example.nz', '09 555 0187', 'Auckland', 'accountant referral', seed_uuid('adviser:rachel'), 'active', null,             null,       'TRL-3005'),
  (seed_uuid('client:ferris'),    'The Ferris Family Trust',    'trust',      'ferristrust@example.nz',  '021 400 067', 'Auckland',  'solicitor referral',     seed_uuid('adviser:rachel'), 'active', current_date - 33,   'enhanced', 'TRL-3006'),
  (seed_uuid('client:rahman'),    'Nadia Rahman',               'individual', 'n.rahman@example.nz',     '021 400 078', 'Auckland',  'Instagram',              seed_uuid('adviser:daniel'), 'active', current_date - 52,   'standard', 'TRL-3007'),
  (seed_uuid('client:cole'),      'Sam & Jordan Cole',          'couple',     'coles@example.nz',        '021 400 089', 'Waitakere', 'Barfoot & Thompson',     seed_uuid('adviser:mere'),   'active', current_date - 47,   'standard', 'TRL-3008'),
  (seed_uuid('client:liu'),       'Grace Liu',                  'individual', 'g.liu@example.nz',        '021 400 090', 'Auckland',  'existing client',        seed_uuid('adviser:daniel'), 'active', current_date - 120,  'standard', 'TRL-3009'),
  (seed_uuid('client:walker'),    'Hemi & Kararaina Walker',    'couple',     'walkers@example.nz',      '021 400 101', 'Papakura',  'existing client referral', seed_uuid('adviser:mere'), 'active', current_date - 90,   'standard', 'TRL-3010'),
  (seed_uuid('client:sharp'),     'Olivia & Ben Sharp',         'couple',     'sharps@example.nz',       '021 400 112', 'Auckland',  'Google search',          seed_uuid('adviser:rachel'), 'active', current_date - 150,  'standard', 'TRL-3011'),
  (seed_uuid('client:mather'),    'Dean Mather',                'individual', 'd.mather@example.nz',     '021 400 123', 'Auckland',  'Trade Me',               seed_uuid('adviser:daniel'), 'active', current_date - 300,  'standard', 'TRL-3012'),
  (seed_uuid('client:fifita'),    'Ana Fifita',                 'individual', 'a.fifita@example.nz',     '021 400 134', 'Manukau',   'existing client',        seed_uuid('adviser:mere'),   'active', current_date - 800,  'standard', 'TRL-3013'),
  (seed_uuid('client:nguyen'),    'Rob & Tessa Nguyen',         'couple',     'nguyens@example.nz',      '021 400 145', 'Auckland',  'existing client',        seed_uuid('adviser:rachel'), 'active', current_date - 1100, 'standard', 'TRL-3014'),
  (seed_uuid('client:ryder'),     'Cameron & Jess Ryder',       'couple',     'ryders@example.nz',       '021 400 156', 'Auckland',  'existing client',        seed_uuid('adviser:daniel'), 'active', current_date - 900,  'standard', 'TRL-3015'),
  (seed_uuid('client:kaur'),      'Sunita Kaur',                'individual', 's.kaur@example.nz',       '021 400 167', 'Auckland',  'existing client',        seed_uuid('adviser:rachel'), 'active', current_date - 700,  'standard', 'TRL-3016'),
  (seed_uuid('client:miller'),    'Miller Orchard Partnership', 'company',    'office@millerorchard.example.nz', '07 555 0122', 'Pukekohe', 'accountant referral', seed_uuid('adviser:rachel'), 'active', current_date - 1600, 'enhanced', 'TRL-3017'),
  (seed_uuid('client:barrett'),   'Jack & Emily Barrett',       'couple',     'barretts@example.nz',     '021 400 189', 'Auckland',  'existing client',        seed_uuid('adviser:daniel'), 'active', current_date - 1300, 'standard', 'TRL-3018'),
  (seed_uuid('client:tearoha'),   'Te Aroha Property Ltd',      'company',    'admin@tearohaproperty.example.nz', '09 555 0165', 'Auckland', 'solicitor referral', seed_uuid('adviser:rachel'), 'active', current_date - 500, 'enhanced', 'TRL-3019'),
  (seed_uuid('client:waite'),     'Stephen & Lorna Waite',      'couple',     'waites@example.nz',       '021 400 201', 'Auckland',  'existing client',        seed_uuid('adviser:mere'),   'active', current_date - 1900, 'standard', 'TRL-3020'),
  (seed_uuid('client:nikau'),     'Nikau Holdings Trust',       'trust',      'trustee@nikauholdings.example.nz', '021 400 212', 'Auckland', 'accountant referral', seed_uuid('adviser:rachel'), 'active', current_date - 1000, 'enhanced', 'TRL-3021'),
  (seed_uuid('client:petrov'),    'Leon Petrov',                'individual', 'l.petrov@example.nz',     '021 400 223', 'Auckland',  'Google search',          seed_uuid('adviser:daniel'), 'active', null,               null,       'TRL-3022'),
  (seed_uuid('client:turner'),    'Maia & Josh Turner',         'couple',     'turners@example.nz',      '021 400 234', 'Auckland',  'Instagram',              seed_uuid('adviser:mere'),   'active', current_date - 6,    'standard', 'TRL-3023'),
  (seed_uuid('client:kemp'),      'Douglas Kemp',               'individual', 'd.kemp@example.nz',       '021 400 245', 'Auckland',  'Trade Me',               seed_uuid('adviser:daniel'), 'active', current_date - 70,   'standard', 'TRL-3024')
on conflict do nothing;

insert into clients (id, name, client_type, email, phone, city, referred_by, adviser_id, status, cdd_completed_on, cdd_type) values
  (seed_uuid('client:brew'), 'Charlotte Brew', 'individual', 'c.brew@example.nz', '021 400 256', 'Auckland', 'existing client', seed_uuid('adviser:rachel'), 'active', current_date - 30, 'standard'),
  (seed_uuid('client:nair'), 'Vikram & Asha Nair', 'couple', 'nairs@example.nz', '021 400 267', 'Auckland', 'Google search', seed_uuid('adviser:mere'), 'active', current_date - 55, 'standard')
on conflict do nothing;

-- Deals: the pipeline ----------------------------------------------------------

insert into deals (id, ref, client_id, adviser_id, lender_id, purpose, stage, stage_since, amount_cents, security_address, security_value_cents,
                   opened_on, fact_find_on, submitted_on, preapproval_expires_on, finance_due_on, approved_on, unconditional_on,
                   settlement_on, settled_on, declined_on, declined_reason, withdrawn_on, note) values
  -- leads and fact finds
  (seed_uuid('deal:petrov'),  'DL-1021', seed_uuid('client:petrov'), seed_uuid('adviser:daniel'), null, 'purchase', 'lead', current_date - 2, 65000000, null, null,
   current_date - 2, null, null, null, null, null, null, null, null, null, null, null, 'First home, KiwiSaver withdrawal, wants to know his number.'),
  (seed_uuid('deal:turner'),  'DL-1020', seed_uuid('client:turner'), seed_uuid('adviser:mere'), null, 'purchase', 'fact-find', current_date - 5, 78000000, null, null,
   current_date - 9, current_date - 5, null, null, null, null, null, null, null, null, null, null, 'Second baby on the way, selling the townhouse first.'),
  -- pre-approvals
  (seed_uuid('deal:boyd'),    'DL-1015', seed_uuid('client:boyd'), seed_uuid('adviser:daniel'), seed_uuid('lender:anz'), 'purchase', 'pre-approval', current_date - 51, 72000000, null, null,
   current_date - 70, current_date - 62, current_date - 58, current_date + 9, null, null, null, null, null, null, null, null, 'Bidding at auctions most weekends. Pre-approval nearly out of road.'),
  (seed_uuid('deal:brew'),    'DL-1018', seed_uuid('client:brew'), seed_uuid('adviser:rachel'), seed_uuid('lender:asb'), 'purchase', 'pre-approval', current_date - 20, 88000000, null, null,
   current_date - 34, current_date - 28, current_date - 24, current_date + 55, null, null, null, null, null, null, null, null, null),
  -- applications
  (seed_uuid('deal:patel'),   'DL-1016', seed_uuid('client:patel'), seed_uuid('adviser:rachel'), seed_uuid('lender:asb'), 'purchase', 'application', current_date - 6, 94000000, '18 Halesowen Ave, Sandringham', 118000000,
   current_date - 30, current_date - 22, current_date - 6, null, current_date + 3, null, null, null, null, null, null, null, 'Finance clause on the S&P. The clock is the deal.'),
  (seed_uuid('deal:tuilagi'), 'DL-1014', seed_uuid('client:tuilagi'), seed_uuid('adviser:mere'), seed_uuid('lender:asb'), 'purchase', 'application', current_date - 12, 68500000, '42 Grande Vue Rd, Manurewa', 86000000,
   current_date - 33, current_date - 26, current_date - 12, null, current_date + 8, null, null, null, null, null, null, null, 'Nothing back from the assessor since submission.'),
  -- conditionals
  (seed_uuid('deal:blackwood'), 'DL-1013', seed_uuid('client:blackwood'), seed_uuid('adviser:rachel'), seed_uuid('lender:resimac'), 'top-up', 'conditional', current_date - 7, 42000000, '7 Keeling Rd, Henderson', 145000000,
   current_date - 41, current_date - 35, current_date - 19, null, null, current_date - 7, null, null, null, null, null, null, 'Workshop extension. Conditional on a registered valuation of the premises.'),
  (seed_uuid('deal:ferris'),  'DL-1017', seed_uuid('client:ferris'), seed_uuid('adviser:rachel'), seed_uuid('lender:westpac'), 'investment', 'conditional', current_date - 4, 76000000, '2/19 Marsden Ave, Mt Eden', 101000000,
   current_date - 27, current_date - 20, current_date - 9, null, current_date + 10, current_date - 4, null, null, null, null, null, null, 'Conditional on rental appraisal and trust deed certification.'),
  -- unconditional and instructed
  (seed_uuid('deal:rahman'),  'DL-1012', seed_uuid('client:rahman'), seed_uuid('adviser:daniel'), seed_uuid('lender:kiwibank'), 'purchase', 'unconditional', current_date - 9, 61500000, '55B Roscommon Rd, Wiri', 76000000,
   current_date - 48, current_date - 40, current_date - 26, null, current_date - 9, current_date - 16, current_date - 9, current_date + 6, null, null, null, null, null),
  (seed_uuid('deal:cole'),    'DL-1011', seed_uuid('client:cole'), seed_uuid('adviser:mere'), seed_uuid('lender:bnz'), 'purchase', 'instructed', current_date - 5, 71800000, '104 Seabrook Ave, New Lynn', 89500000,
   current_date - 55, current_date - 47, current_date - 31, null, current_date - 14, current_date - 21, current_date - 14, current_date + 3, null, null, null, null, 'Solicitor has the instructions. The advice file does not have the record of advice.'),
  -- settled
  (seed_uuid('deal:liu'),     'DL-1008', seed_uuid('client:liu'), seed_uuid('adviser:daniel'), seed_uuid('lender:pepper'), 'refinance', 'settled', current_date - 45, 40200000, '31 Kohia Tce, Epsom', 92000000,
   current_date - 96, current_date - 88, current_date - 70, null, null, current_date - 60, current_date - 52, current_date - 45, current_date - 45, null, null, null, 'Self-employed refinance out of a second tier lender.'),
  (seed_uuid('deal:walker'),  'DL-1010', seed_uuid('client:walker'), seed_uuid('adviser:mere'), seed_uuid('lender:asb'), 'purchase', 'settled', current_date - 12, 53000000, '8 Clevedon Rd, Papakura', 66500000,
   current_date - 74, current_date - 66, current_date - 47, null, current_date - 33, current_date - 40, current_date - 33, current_date - 12, current_date - 12, null, null, null, null),
  (seed_uuid('deal:sharp'),   'DL-1006', seed_uuid('client:sharp'), seed_uuid('adviser:rachel'), seed_uuid('lender:bnz'), 'purchase', 'settled', current_date - 70, 49500000, '12 Selwyn St, Onehunga', 63000000,
   current_date - 130, current_date - 121, current_date - 101, null, current_date - 87, current_date - 94, current_date - 87, current_date - 70, current_date - 70, null, null, null, null),
  -- declined and withdrawn
  (seed_uuid('deal:kemp'),    'DL-1019', seed_uuid('client:kemp'), seed_uuid('adviser:daniel'), seed_uuid('lender:westpac'), 'purchase', 'declined', current_date - 15, 58000000, null, null,
   current_date - 44, current_date - 37, current_date - 25, null, null, null, null, null, null, current_date - 15, 'Servicing shortfall after the CCCFA expense review. Revisit when the car loan is cleared.', null, null),
  (seed_uuid('deal:nair'),    'DL-1009', seed_uuid('client:nair'), seed_uuid('adviser:mere'), null, 'purchase', 'withdrawn', current_date - 28, 83000000, null, null,
   current_date - 60, current_date - 51, null, null, null, null, null, null, null, null, null, current_date - 28, 'Missed the house at auction and paused the search.')
on conflict do nothing;

-- Deal events: the pipeline is only as honest as this log.

insert into deal_events (id, deal_id, noted_on, event, note) values
  (seed_uuid('event:patel1'),   seed_uuid('deal:patel'),   current_date - 6,  'submitted to ASB', 'Full application with S&P attached.'),
  (seed_uuid('event:patel2'),   seed_uuid('deal:patel'),   current_date - 2,  'lender query', 'ASB assessor asked for the last three payslips and the childcare costs.'),
  (seed_uuid('event:tuilagi1'), seed_uuid('deal:tuilagi'), current_date - 12, 'submitted to ASB', 'Queue was quoted at five working days.'),
  (seed_uuid('event:boyd1'),    seed_uuid('deal:boyd'),    current_date - 58, 'submitted to ANZ', 'Pre-approval application.'),
  (seed_uuid('event:boyd2'),    seed_uuid('deal:boyd'),    current_date - 51, 'pre-approval issued', 'Ninety day pre-approval, condition: 20% deposit evidence at offer.'),
  (seed_uuid('event:blackwood1'), seed_uuid('deal:blackwood'), current_date - 7, 'conditional approval', 'Resimac approved subject to registered valuation.'),
  (seed_uuid('event:blackwood2'), seed_uuid('deal:blackwood'), current_date - 3, 'valuation booked', 'Valuer on site Thursday.'),
  (seed_uuid('event:ferris1'),  seed_uuid('deal:ferris'),  current_date - 4,  'conditional approval', 'Westpac wants the rental appraisal and the certified trust deed.'),
  (seed_uuid('event:rahman1'),  seed_uuid('deal:rahman'),  current_date - 9,  'unconditional', 'Client confirmed finance to the agent.'),
  (seed_uuid('event:cole1'),    seed_uuid('deal:cole'),    current_date - 5,  'solicitor instructed', 'BNZ documents with Turner & Rowe.'),
  (seed_uuid('event:kemp1'),    seed_uuid('deal:kemp'),    current_date - 15, 'declined', 'Servicing shortfall. Told the client same day, plan to clear the car loan first.')
on conflict do nothing;

-- The advice file: six records per deal, created missing, then marked on file
-- where the work was actually done. The gaps left open are the point.

insert into advice_records (id, deal_id, kind, standard, status)
select seed_uuid('advice:' || d.ref || ':' || k.kind), d.id, k.kind, k.standard, 'missing'
from deals d
cross join (values
  ('scope of service disclosure',            'FMC (Regulated Financial Advice Disclosure) Regulations 2020: disclose when the nature and scope of the advice is known'),
  ('fact find and needs analysis',           'Code of Professional Conduct for Financial Advice Services, Standard 3: the advice must be suitable'),
  ('affordability and suitability evidence', 'CCCFA 2003, s 9C: reasonable inquiries into requirements, objectives and affordability'),
  ('AML/CFT customer due diligence',         'AML/CFT Act 2009, ss 11 to 16: CDD before the business relationship is established'),
  ('commission and clawback disclosure',     'Disclosure Regulations 2020: commission, incentives and fees the client may pay, including a clawback fee'),
  ('record of advice',                       'FMCA 2013 and FAP standard conditions: a record of the advice given, kept seven years')
) as k(kind, standard)
on conflict do nothing;

-- Mark the records that are genuinely on file. Everything not updated here
-- stays missing, and /compliance says so.
update advice_records ar set status = 'on file', done_on = d.fact_find_on
from deals d where d.id = ar.deal_id and d.fact_find_on is not null
  and ar.kind in ('scope of service disclosure', 'fact find and needs analysis', 'commission and clawback disclosure');
update advice_records ar set status = 'on file', done_on = d.submitted_on
from deals d where d.id = ar.deal_id and d.submitted_on is not null
  and ar.kind = 'affordability and suitability evidence';
update advice_records ar set status = 'on file', done_on = c.cdd_completed_on
from deals d join clients c on c.id = d.client_id
where d.id = ar.deal_id and c.cdd_completed_on is not null and ar.kind = 'AML/CFT customer due diligence';
update advice_records ar set status = 'on file', done_on = d.submitted_on
from deals d where d.id = ar.deal_id and d.submitted_on is not null
  and d.stage in ('application', 'conditional', 'unconditional', 'instructed', 'settled')
  and ar.kind = 'record of advice';
-- The Cole file is instructed, settles in three days, and the record of advice
-- is not there. The Tuilagi application went in without the affordability
-- evidence being filed. These two are the demo's compliance story.
update advice_records ar set status = 'missing', done_on = null
from deals d where d.id = ar.deal_id and d.ref = 'DL-1011' and ar.kind = 'record of advice';
update advice_records ar set status = 'missing', done_on = null
from deals d where d.id = ar.deal_id and d.ref = 'DL-1014' and ar.kind = 'affordability and suitability evidence';

-- Loans: the book ---------------------------------------------------------------
-- Rates are demo rates in basis points (628 = 6.28%).

insert into loans (id, loan_number, deal_id, client_id, adviser_id, lender_id, drawn_on, amount_cents, balance_cents, rate_bps, rate_type, fixed_until, term_months, repayment, status, discharged_on, discharge_reason, external_ref) values
  -- The Whelan book: $910k, biggest tranche refixes in 47 days, nobody has rung them.
  (seed_uuid('loan:whelan1'), 'LN-2001', null, seed_uuid('client:whelan'), seed_uuid('adviser:mere'), seed_uuid('lender:anz'), current_date - 683, 48000000, 46100000, 599, 'fixed', current_date + 47, 360, 'principal and interest', 'active', null, null, 'TRL-L-401'),
  (seed_uuid('loan:whelan2'), 'LN-2002', null, seed_uuid('client:whelan'), seed_uuid('adviser:mere'), seed_uuid('lender:anz'), current_date - 683, 28000000, 27200000, 645, 'fixed', current_date + 230, 360, 'principal and interest', 'active', null, null, 'TRL-L-402'),
  (seed_uuid('loan:whelan3'), 'LN-2003', null, seed_uuid('client:whelan'), seed_uuid('adviser:mere'), seed_uuid('lender:anz'), current_date - 683, 15000000, 13800000, 739, 'floating', null, 360, 'principal and interest', 'active', null, null, 'TRL-L-403'),
  -- Ana Fifita: the fixed rate lapsed five days ago and the record still says fixed.
  (seed_uuid('loan:fifita'),  'LN-2004', null, seed_uuid('client:fifita'), seed_uuid('adviser:mere'), seed_uuid('lender:bnz'), current_date - 750, 38500000, 36400000, 585, 'fixed', current_date - 5, 300, 'principal and interest', 'active', null, null, 'TRL-L-404'),
  -- The Nguyens: $520k refixes in 21 days, last contact 75 days ago.
  (seed_uuid('loan:nguyen1'), 'LN-2005', null, seed_uuid('client:nguyen'), seed_uuid('adviser:rachel'), seed_uuid('lender:westpac'), current_date - 460, 52000000, 50300000, 612, 'fixed', current_date + 21, 360, 'principal and interest', 'active', null, null, 'TRL-L-405'),
  (seed_uuid('loan:nguyen2'), 'LN-2006', null, seed_uuid('client:nguyen'), seed_uuid('adviser:rachel'), seed_uuid('lender:westpac'), current_date - 460, 9000000, 8100000, 745, 'floating', null, 360, 'principal and interest', 'active', null, null, 'TRL-L-406'),
  -- The Ryders: refix in 34 days, but Daniel rang them last week. Watched, not worrying.
  (seed_uuid('loan:ryder'),   'LN-2007', null, seed_uuid('client:ryder'), seed_uuid('adviser:daniel'), seed_uuid('lender:asb'), current_date - 700, 61000000, 58700000, 605, 'fixed', current_date + 34, 360, 'principal and interest', 'active', null, null, 'TRL-L-407'),
  -- Sunita Kaur: refix in 55 days, last contact 41 days ago.
  (seed_uuid('loan:kaur'),    'LN-2008', null, seed_uuid('client:kaur'), seed_uuid('adviser:rachel'), seed_uuid('lender:kiwibank'), current_date - 560, 34000000, 32900000, 619, 'fixed', current_date + 55, 300, 'principal and interest', 'active', null, null, 'TRL-L-408'),
  -- Miller Orchard: solid book, review 118 days overdue.
  (seed_uuid('loan:miller'),  'LN-2009', null, seed_uuid('client:miller'), seed_uuid('adviser:rachel'), seed_uuid('lender:tsb'), current_date - 1450, 64000000, 55600000, 634, 'fixed', current_date + 140, 240, 'principal and interest', 'active', null, null, 'TRL-L-409'),
  -- The Barretts: review 35 days overdue.
  (seed_uuid('loan:barrett'), 'LN-2010', null, seed_uuid('client:barrett'), seed_uuid('adviser:daniel'), seed_uuid('lender:anz'), current_date - 1200, 44500000, 41200000, 641, 'fixed', current_date + 205, 360, 'principal and interest', 'active', null, null, 'TRL-L-410'),
  -- Te Aroha Property: interest-only investment lending with a non-bank, trail every month.
  (seed_uuid('loan:tearoha'), 'LN-2011', null, seed_uuid('client:tearoha'), seed_uuid('adviser:rachel'), seed_uuid('lender:resimac'), current_date - 400, 78000000, 78000000, 689, 'floating', null, 300, 'interest only', 'active', null, null, 'TRL-L-411'),
  -- The Waites: quiet, healthy, refixes next year.
  (seed_uuid('loan:waite'),   'LN-2012', null, seed_uuid('client:waite'), seed_uuid('adviser:mere'), seed_uuid('lender:anz'), current_date - 1700, 29000000, 24100000, 596, 'fixed', current_date + 320, 300, 'principal and interest', 'active', null, null, 'TRL-L-412'),
  -- Nikau Holdings: the biggest single exposure on the book.
  (seed_uuid('loan:nikau'),   'LN-2013', null, seed_uuid('client:nikau'), seed_uuid('adviser:rachel'), seed_uuid('lender:westpac'), current_date - 880, 85000000, 81500000, 622, 'fixed', current_date + 150, 360, 'interest only', 'active', null, null, 'TRL-L-413'),
  -- Recent settlements out of the pipeline above.
  (seed_uuid('loan:liu'),     'LN-2014', seed_uuid('deal:liu'), seed_uuid('client:liu'), seed_uuid('adviser:daniel'), seed_uuid('lender:pepper'), current_date - 45, 40200000, 40200000, 702, 'fixed', current_date + 685, 360, 'principal and interest', 'active', null, null, null),
  (seed_uuid('loan:walker1'), 'LN-2015', seed_uuid('deal:walker'), seed_uuid('client:walker'), seed_uuid('adviser:mere'), seed_uuid('lender:asb'), current_date - 12, 38000000, 38000000, 618, 'fixed', current_date + 718, 360, 'principal and interest', 'active', null, null, null),
  (seed_uuid('loan:walker2'), 'LN-2016', seed_uuid('deal:walker'), seed_uuid('client:walker'), seed_uuid('adviser:mere'), seed_uuid('lender:asb'), current_date - 12, 15000000, 15000000, 655, 'fixed', current_date + 353, 360, 'principal and interest', 'active', null, null, null),
  (seed_uuid('loan:sharp'),   'LN-2017', seed_uuid('deal:sharp'), seed_uuid('client:sharp'), seed_uuid('adviser:rachel'), seed_uuid('lender:bnz'), current_date - 70, 49500000, 49100000, 611, 'fixed', current_date + 660, 360, 'principal and interest', 'active', null, null, null),
  -- Dean Mather: drawn eight months ago, discharged twelve days ago. Clawback.
  (seed_uuid('loan:mather'),  'LN-2018', null, seed_uuid('client:mather'), seed_uuid('adviser:daniel'), seed_uuid('lender:anz'), current_date - 245, 35000000, 0, 629, 'fixed', current_date + 485, 360, 'principal and interest', 'discharged', current_date - 12, 'Refinanced to a competitor cashback offer. We never saw it coming because nobody had rung him.', 'TRL-L-418')
on conflict do nothing;

-- Commission: expected, received, short and clawed back --------------------------

insert into commission_entries (id, loan_id, kind, period_month, expected_cents, received_cents, received_on, note) values
  -- Upfronts on the older book, all received (abridged history).
  (seed_uuid('comm:whelan'),  seed_uuid('loan:whelan1'), 'upfront', null, 408000, 408000, current_date - 668, 'Covers the three-part split at drawdown.'),
  (seed_uuid('comm:nguyen'),  seed_uuid('loan:nguyen1'), 'upfront', null, 468000, 468000, current_date - 446, null),
  (seed_uuid('comm:ryder'),   seed_uuid('loan:ryder'),   'upfront', null, 518500, 518500, current_date - 685, null),
  (seed_uuid('comm:kaur'),    seed_uuid('loan:kaur'),    'upfront', null, 187000, 187000, current_date - 545, null),
  (seed_uuid('comm:nikau'),   seed_uuid('loan:nikau'),   'upfront', null, 765000, 765000, current_date - 866, null),
  -- Grace Liu: settled 45 days ago, Pepper upfront still not on a statement.
  (seed_uuid('comm:liu'),     seed_uuid('loan:liu'),     'upfront', null, 261300, null, null, 'Missing from the last two aggregator statements. Query lodged with nobody yet.'),
  -- The Walkers: settled twelve days ago, paid promptly and in full.
  (seed_uuid('comm:walker1'), seed_uuid('loan:walker1'), 'upfront', null, 323000, 323000, current_date - 4, null),
  (seed_uuid('comm:walker2'), seed_uuid('loan:walker2'), 'upfront', null, 127500, 127500, current_date - 4, null),
  -- The Sharps: BNZ paid $500 short and nobody queried it.
  (seed_uuid('comm:sharp'),   seed_uuid('loan:sharp'),   'upfront', null, 272250, 222250, current_date - 40, 'Statement line does not match the schedule. Short $500.'),
  -- Dean Mather: upfront received at settlement, clawback raised at discharge.
  (seed_uuid('comm:mather'),  seed_uuid('loan:mather'),  'upfront', null, 297500, 297500, current_date - 230, null),
  (seed_uuid('comm:mather-cb'), seed_uuid('loan:mather'), 'clawback', null, -209352, null, null, 'Discharged at month 8 of a 27 month window. Straight-line estimate; the ANZ schedule figure governs.'),
  -- Trail, last month, on the book that pays it.
  (seed_uuid('comm:tearoha-t1'), seed_uuid('loan:tearoha'), 'trail', date_trunc('month', current_date - 28)::date, 16250, 16250, current_date - 9, null),
  (seed_uuid('comm:liu-t1'),     seed_uuid('loan:liu'),     'trail', date_trunc('month', current_date - 28)::date, 8375, null, null, 'First trail month missing along with the upfront.'),
  (seed_uuid('comm:fifita-t1'),  seed_uuid('loan:fifita'),  'trail', date_trunc('month', current_date - 28)::date, 4550, 4550, current_date - 9, null),
  (seed_uuid('comm:kaur-t1'),    seed_uuid('loan:kaur'),    'trail', date_trunc('month', current_date - 28)::date, 4113, 4113, current_date - 9, null),
  -- A refix fee: the Waites refixed with ANZ six weeks ago.
  (seed_uuid('comm:waite-rf'),   seed_uuid('loan:waite'),   'refix fee', null, 15000, 15000, current_date - 40, 'Twelve month refix completed at the annual review.')
on conflict do nothing;

-- Reviews: the promised annual service ------------------------------------------

insert into reviews (id, client_id, kind, due_on, completed_on, adviser_id, note) values
  (seed_uuid('review:miller1'),  seed_uuid('client:miller'),  'annual review', current_date - 483, current_date - 470, seed_uuid('adviser:rachel'), 'Reviewed the orchard season cashflow. Extended interest-only for twelve months.'),
  (seed_uuid('review:miller2'),  seed_uuid('client:miller'),  'annual review', current_date - 118, null, null, null),
  (seed_uuid('review:barrett1'), seed_uuid('client:barrett'), 'annual review', current_date - 400, current_date - 396, seed_uuid('adviser:daniel'), null),
  (seed_uuid('review:barrett2'), seed_uuid('client:barrett'), 'annual review', current_date - 35, null, null, null),
  (seed_uuid('review:whelan'),   seed_uuid('client:whelan'),  'annual review', current_date + 25, null, null, 'Fold into the refix conversation. LN-2001 ends first.'),
  (seed_uuid('review:tearoha'),  seed_uuid('client:tearoha'), 'annual review', current_date + 40, null, null, null),
  (seed_uuid('review:waite'),    seed_uuid('client:waite'),   'annual review', current_date - 320, current_date - 314, seed_uuid('adviser:mere'), 'Happy. Overpaying $200 a fortnight.'),
  (seed_uuid('review:nikau'),    seed_uuid('client:nikau'),   'annual review', current_date + 95, null, null, null),
  (seed_uuid('review:kaur'),     seed_uuid('client:kaur'),    'annual review', current_date + 55, null, null, 'Line up with the refix.')
on conflict do nothing;

-- Tasks --------------------------------------------------------------------------

insert into tasks (id, title, client_id, deal_id, adviser_id, due_on, status, done_on, note) values
  (seed_uuid('task:tuilagi'), 'Chase the ASB assessor on DL-1014', seed_uuid('client:tuilagi'), seed_uuid('deal:tuilagi'), seed_uuid('adviser:mere'), current_date - 3, 'open', null, 'Twelve days in the queue against a quoted five.'),
  (seed_uuid('task:liu'),     'Query the missing Pepper upfront on LN-2014', seed_uuid('client:liu'), null, seed_uuid('adviser:daniel'), current_date - 7, 'open', null, null),
  (seed_uuid('task:cole'),    'Write the record of advice for DL-1011 before settlement', seed_uuid('client:cole'), seed_uuid('deal:cole'), seed_uuid('adviser:mere'), current_date + 1, 'open', null, null),
  (seed_uuid('task:patel'),   'Payslips and childcare costs to ASB for DL-1016', seed_uuid('client:patel'), seed_uuid('deal:patel'), seed_uuid('adviser:rachel'), current_date + 1, 'open', null, null),
  (seed_uuid('task:boyd'),    'Renew or extend the ANZ pre-approval for Marcus Boyd', seed_uuid('client:boyd'), seed_uuid('deal:boyd'), seed_uuid('adviser:daniel'), current_date + 4, 'open', null, null),
  (seed_uuid('task:ferris'),  'Rental appraisal to Westpac for DL-1017', seed_uuid('client:ferris'), seed_uuid('deal:ferris'), seed_uuid('adviser:rachel'), current_date + 2, 'open', null, null),
  (seed_uuid('task:done1'),   'Book the valuer for Blackwood Joinery', seed_uuid('client:blackwood'), seed_uuid('deal:blackwood'), seed_uuid('adviser:rachel'), current_date - 4, 'done', current_date - 3, null)
on conflict do nothing;

-- Contact notes: who has actually been spoken to ----------------------------------

insert into contact_notes (id, client_id, deal_id, adviser_id, noted_on, channel, note) values
  (seed_uuid('note:whelan'),  seed_uuid('client:whelan'), null, seed_uuid('adviser:mere'), current_date - 104, 'email', 'Sent the January rate commentary. No reply.'),
  (seed_uuid('note:patel'),   seed_uuid('client:patel'), seed_uuid('deal:patel'), seed_uuid('adviser:rachel'), current_date - 2, 'phone', 'Walked them through the ASB payslip request. They will send tonight.'),
  (seed_uuid('note:boyd'),    seed_uuid('client:boyd'), seed_uuid('deal:boyd'), seed_uuid('adviser:daniel'), current_date - 6, 'text', 'Missed out at auction again, 1310 Dominion Rd went 6% over CV.'),
  (seed_uuid('note:tuilagi'), seed_uuid('client:tuilagi'), seed_uuid('deal:tuilagi'), seed_uuid('adviser:mere'), current_date - 5, 'phone', 'Told them the queue is slow. Vendor agent already sniffing about the finance date.'),
  (seed_uuid('note:rahman'),  seed_uuid('client:rahman'), seed_uuid('deal:rahman'), seed_uuid('adviser:daniel'), current_date - 3, 'email', 'Confirmed settlement logistics and the insurance requirement with the solicitor.'),
  (seed_uuid('note:cole'),    seed_uuid('client:cole'), seed_uuid('deal:cole'), seed_uuid('adviser:mere'), current_date - 4, 'phone', 'Pre-settlement call. They asked what happens to the rate if settlement slips.'),
  (seed_uuid('note:nguyen'),  seed_uuid('client:nguyen'), null, seed_uuid('adviser:rachel'), current_date - 75, 'email', 'Annual rate summary sent.'),
  (seed_uuid('note:ryder'),   seed_uuid('client:ryder'), null, seed_uuid('adviser:daniel'), current_date - 8, 'phone', 'Refix options discussed: 12 month at 5.79 vs 24 at 5.65. They will decide next week.'),
  (seed_uuid('note:kaur'),    seed_uuid('client:kaur'), null, seed_uuid('adviser:rachel'), current_date - 41, 'email', 'Asked about topping up for a bathroom renovation. Parked until the refix.'),
  (seed_uuid('note:miller'),  seed_uuid('client:miller'), null, seed_uuid('adviser:rachel'), current_date - 88, 'phone', 'Season update. Review still to be booked.'),
  (seed_uuid('note:barrett'), seed_uuid('client:barrett'), null, seed_uuid('adviser:daniel'), current_date - 20, 'email', 'Sent the review booking link. No booking yet.'),
  (seed_uuid('note:tearoha'), seed_uuid('client:tearoha'), null, seed_uuid('adviser:rachel'), current_date - 15, 'meeting', 'Portfolio catch-up. Watching for a fourth purchase in spring.'),
  (seed_uuid('note:waite'),   seed_uuid('client:waite'), null, seed_uuid('adviser:mere'), current_date - 60, 'email', 'Rate commentary sent. Replied happy.'),
  (seed_uuid('note:liu'),     seed_uuid('client:liu'), seed_uuid('deal:liu'), seed_uuid('adviser:daniel'), current_date - 10, 'phone', 'Post-settlement check-in. Repayments landing fine.'),
  (seed_uuid('note:walker'),  seed_uuid('client:walker'), seed_uuid('deal:walker'), seed_uuid('adviser:mere'), current_date - 5, 'phone', 'Settled and moved in. Asked about insurance review, referred.'),
  (seed_uuid('note:sharp'),   seed_uuid('client:sharp'), null, seed_uuid('adviser:rachel'), current_date - 35, 'email', 'First repayment confirmation.'),
  (seed_uuid('note:fifita'),  seed_uuid('client:fifita'), null, seed_uuid('adviser:mere'), current_date - 33, 'phone', 'Rang about the coming expiry. She wanted to wait and see the next OCR. No follow-up was booked.'),
  (seed_uuid('note:nikau'),   seed_uuid('client:nikau'), null, seed_uuid('adviser:rachel'), current_date - 25, 'meeting', 'Trustee meeting. Interest-only renewal signed.'),
  (seed_uuid('note:brew'),    seed_uuid('client:brew'), seed_uuid('deal:brew'), seed_uuid('adviser:rachel'), current_date - 7, 'text', 'Offer on Kingsland apartment did not land. Still looking.'),
  (seed_uuid('note:turner'),  seed_uuid('client:turner'), seed_uuid('deal:turner'), seed_uuid('adviser:mere'), current_date - 5, 'meeting', 'Fact find done at the kitchen table. Townhouse appraisal booked.'),
  (seed_uuid('note:kemp'),    seed_uuid('client:kemp'), seed_uuid('deal:kemp'), seed_uuid('adviser:daniel'), current_date - 15, 'phone', 'Delivered the decline and the plan: clear the car loan, return in the spring.'),
  (seed_uuid('note:mather'),  seed_uuid('client:mather'), null, seed_uuid('adviser:daniel'), current_date - 12, 'phone', 'He rang to say the Westpac cashback paid for his solicitor. Logged the discharge same day.')
on conflict do nothing;
