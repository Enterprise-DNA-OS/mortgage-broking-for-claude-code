#!/usr/bin/env node
// Loads supabase/seed.sql: Harbourline Mortgages, a demo Auckland advice firm
// with 3 advisers, a 9 lender panel, 24 clients, a pipeline from lead to
// settlement, a $9m loan book with a refix season coming, commission in every
// state and an annual review book with holes in it. Every row has a derived id
// and inserts with ON CONFLICT DO NOTHING, so re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from advisers)            as advisers,
           (select count(*) from clients)             as clients,
           (select count(*) from lenders)             as lenders,
           (select count(*) from deals)               as deals,
           (select count(*) from deal_events)         as deal_events,
           (select count(*) from advice_records)      as advice_records,
           (select count(*) from loans)               as loans,
           (select count(*) from commission_entries)  as commission_entries,
           (select count(*) from reviews)             as reviews,
           (select count(*) from tasks)               as tasks,
           (select count(*) from contact_notes)       as notes
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    const n = await seed(db);
    console.log(
      `seed: ${n.advisers} advisers, ${n.clients} clients, ${n.lenders} lenders, ${n.deals} deals ` +
        `(${n.deal_events} events, ${n.advice_records} advice records), ${n.loans} loans, ` +
        `${n.commission_entries} commission entries, ${n.reviews} reviews, ${n.tasks} tasks, ${n.notes} notes`,
    );
  } finally {
    await db.close();
  }
}
