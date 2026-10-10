// Database tests for the Black Belt Prep System.
// Builds the card software's database, adds the prep system on top, then checks the
// scenarios from spec section 16 that the database is responsible for.
//
//   cd tests && npm install && CARD_REPO=/path/to/ama-id-cards node database.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CARD = process.env.CARD_REPO || join(here, '../../theggatonklenner/ama-id-cards');
const read = p => readFileSync(p, 'utf8');

const db = new PGlite();
let passed = 0, failed = 0;
function ok(cond, name) { if (cond) { passed++; console.log('  pass  ' + name); } else { failed++; console.log('  FAIL  ' + name); } }
async function rows(sql, params = []) { return (await db.query(sql, params)).rows; }
async function one(sql, params = []) { return (await rows(sql, params))[0]; }
async function fails(fn, pattern, name) {
  try { await fn(); ok(false, name + ' (no error)'); }
  catch (e) { ok(!pattern || pattern.test(e.message), name + (pattern && !pattern.test(e.message) ? ` (got: ${e.message})` : '')); }
}
// Run as a signed-in user
async function as(email, fn) {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ email })]);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false)`); }
}

console.log('Setting up');
await db.exec(read(join(here, 'supabase-stub.sql')));
await db.exec(`insert into auth.users (email) values ('owner@ama.test')`);
await db.exec(read(join(CARD, 'supabase/setup.sql')));
await db.exec(read(join(CARD, 'supabase/roles.sql')));
await db.exec(read(join(CARD, 'supabase/printed.sql')));
const PREP = read(join(here, '../supabase/prep-setup.sql'));
await db.exec(PREP);
await db.exec(PREP); // safe to run twice
ok(true, 'prep-setup.sql runs twice without errors');

const ADMIN = 'owner@ama.test';
ok((await one(`select role from prep_roles where email = $1`, [ADMIN]))?.role === 'admin', 'card software admin becomes prep admin');
await db.exec(`insert into prep_roles (email, role) values
  ('inst@ama.test','instructor'), ('att@ama.test','attendance'), ('pay@ama.test','payments'),
  ('grade@ama.test','grading'), ('cert@ama.test','certificates'), ('card@ama.test','idcards'), ('view@ama.test','viewer')`);

// ---------------------------------------------------------------------------
console.log('\nStudents');
await as(ADMIN, () => db.exec(`
  insert into prep_students (full_name, club, belt_rank, dob) values
    ('Alex Smith','Marrickville','1st Poom','2010-03-01'),
    ('Jordan Lee','Marrickville','1st Dan','2008-07-12'),
    ('Taylor Brown','Newtown','1st Poom','2011-01-20');
  insert into prep_students (full_name, is_test) values ('Test Student', true);
  insert into prep_students (full_name, is_active) values ('Former Student', false);`));
const ids = (await rows(`select student_id, full_name from prep_students order by student_id`));
const S = Object.fromEntries(ids.map(r => [r.full_name.split(' ')[0], r.student_id]));
ok(S.Alex === 'BB0001' && S.Jordan === 'BB0002', 'Student IDs are generated (BB0001, BB0002, ...)');
await as(ADMIN, () => db.exec(`update prep_students set club = 'Newtown' where student_id = 'BB0001'`));
ok((await one(`select club from prep_students where student_id = 'BB0001'`)).club === 'Newtown', 'student details can be edited');
await fails(() => as(ADMIN, () => db.exec(`update prep_students set student_id = 'X1' where student_id = 'BB0001'`)), /cannot be changed/, 'Student ID cannot be changed');
await fails(() => as(ADMIN, () => db.exec(`insert into prep_students (student_id, full_name) values ('BB0001', 'Someone')`)), /duplicate key/, 'duplicate Student ID is rejected');
await as(ADMIN, () => db.exec(`insert into prep_students (full_name) values ('alex  SMITH')`));
ok((await rows(`select * from prep_possible_duplicates`)).some(d => d.student_a === 'BB0001'), 'possible duplicate names are flagged');
await as(ADMIN, () => db.exec(`update prep_students set is_active = false where full_name = 'alex  SMITH'`));
await as('view@ama.test', () => db.exec(`update prep_students set full_name = 'Hacked' where student_id = 'BB0002'`));
ok((await one(`select full_name from prep_students where student_id = 'BB0002'`)).full_name === 'Jordan Lee', 'viewer cannot edit students');

// ---------------------------------------------------------------------------
console.log('\nNew preparation cycle');
const c1 = (await as(ADMIN, () => one(`select prep_start_new_cycle('Term 3 2026', '2026-07-20', '2026-08-10',
  array['2026-07-20','2026-07-27','2026-08-03','2026-08-10']::date[], 120, '2026-07-27') as id`))).id;
const cnt = async (t, where = '', p = []) => Number((await one(`select count(*) n from ${t} ${where}`, p)).n);
ok(await cnt('prep_sessions', 'where cycle_id = $1', [c1]) === 4, 'four sessions created');
ok(await cnt('prep_enrolments', 'where cycle_id = $1', [c1]) === 3, 'active, non-test students enrolled (test and inactive left out)');
ok(await cnt('prep_attendance', `where cycle_id = $1 and status = 'not_recorded'`, [c1]) === 12, 'attendance starts as "not recorded" (12 rows)');
ok(await cnt('prep_readiness', `where cycle_id = $1 and status = 'not_assessed'`, [c1]) === 3, 'readiness starts as "not assessed"');
ok(await cnt('prep_payments', `where cycle_id = $1 and amount_due = 120`, [c1]) === 3, 'fee records created at the cycle fee');
await fails(() => as(ADMIN, () => db.query(`select prep_start_new_cycle('term 3 2026', null, null, null, 120)`)), /already exists/, 'starting the same cycle twice is blocked');
ok(await cnt('prep_cycles') === 1, 'no duplicate cycle was created');
await fails(() => as('inst@ama.test', () => db.query(`select prep_start_new_cycle('X', null, null, null, 1)`)), /Only an admin/, 'only admins can start a cycle');
await as(ADMIN, () => db.query(`select prep_activate_cycle($1)`, [c1]));
ok((await one(`select status from prep_cycles where cycle_id = $1`, [c1])).status === 'active', 'cycle activated');

// ---------------------------------------------------------------------------
console.log('\nAttendance');
const sess = (await rows(`select session_id from prep_sessions where cycle_id = $1 order by session_number`, [c1])).map(r => r.session_id);
await as('att@ama.test', () => db.exec(`update prep_attendance set status = 'present' where session_id = '${sess[0]}' and student_id = 'BB0001'`));
const a1 = await one(`select status, recorded_by, recorded_at from prep_attendance where session_id = $1 and student_id = 'BB0001'`, [sess[0]]);
ok(a1.status === 'present' && a1.recorded_by === 'att@ama.test' && a1.recorded_at, 'individual attendance records who and when');
const n = (await as('att@ama.test', () => one(`select prep_mark_attendance($1, array['BB0002','BB0003'], 'present') n`, [sess[1]]))).n;
ok(n === 2, 'bulk mark present updates the selected students');
ok(await cnt('prep_attendance', `where session_id = $1 and student_id = 'BB0001' and status = 'not_recorded'`, [sess[1]]) === 1, 'bulk marking does not mark anyone else absent');
await as('att@ama.test', () => db.query(`select prep_mark_attendance($1, array['BB0002'], 'absent')`, [sess[1]]));
ok((await one(`select status from prep_attendance where session_id = $1 and student_id = 'BB0002'`, [sess[1]])).status === 'absent', 'attendance can be corrected');
await fails(() => as(ADMIN, () => db.exec(`insert into prep_attendance (student_id, cycle_id, session_id) values ('BB0001', '${c1}', '${sess[0]}')`)), /row-level security/, 'attendance rows cannot be added by hand (created automatically)');
await fails(() => db.exec(`insert into prep_attendance (student_id, cycle_id, session_id) values ('BB0001', '${c1}', '${sess[0]}')`), /duplicate key/, 'even bypassing the app, a second record for the same session is blocked');
await as('view@ama.test', () => db.exec(`update prep_attendance set status = 'absent' where student_id = 'BB0001'`));
ok(await cnt('prep_attendance', `where student_id = 'BB0001' and status = 'absent'`) === 0, 'viewer cannot change attendance');

// Alex: P, -, -, - ; Jordan: -, A, -, - ; Taylor: -, P, -, -
let sum = await one(`select * from prep_attendance_summary where cycle_id = $1 and student_id = 'BB0001'`, [c1]);
ok(sum.attended === 1 && sum.unrecorded === 3 && Number(sum.attendance_pct) === 100, 'percentage uses recorded sessions only (1 of 1 = 100%)');
await as('att@ama.test', () => db.exec(`
  select prep_mark_attendance('${sess[1]}', array['BB0001'], 'absent');
  select prep_mark_attendance('${sess[2]}', array['BB0001'], 'excused');`));
sum = await one(`select * from prep_attendance_summary where cycle_id = $1 and student_id = 'BB0001'`, [c1]);
ok(Number(sum.attendance_pct) === 50 && sum.excused === 1 && sum.unrecorded === 1, 'excused and unrecorded are left out of the percentage (1 of 2 = 50%)');
await as('att@ama.test', () => db.exec(`select prep_mark_attendance(session_id, array['BB0003'], 'present') from prep_sessions where cycle_id = '${c1}'`));
ok((await one(`select attendance_eligible from prep_attendance_summary where student_id = 'BB0003' and cycle_id = $1`, [c1])).attendance_eligible === true, 'four sessions present meets the attendance requirement');

// ---------------------------------------------------------------------------
console.log('\nReadiness');
ok((await one(`select status from prep_readiness where student_id = 'BB0003' and cycle_id = $1`, [c1])).status === 'not_assessed', 'attending all four sessions does not mark a student ready');
await as('inst@ama.test', () => db.exec(`update prep_readiness set status = 'not_ready', reason = 'technique', notes = 'Poomsae timing', next_action = 'Extra class' where student_id = 'BB0001' and cycle_id = '${c1}'`));
const r1 = await one(`select * from prep_readiness where student_id = 'BB0001' and cycle_id = $1`, [c1]);
ok(r1.status === 'not_ready' && r1.reviewed_by === 'inst@ama.test' && r1.reviewed_at, 'instructor flags not ready with reason; reviewer recorded');
await as('inst@ama.test', () => db.exec(`update prep_readiness set status = 'ready', reason = null where student_id = 'BB0001' and cycle_id = '${c1}'`));
ok(await cnt('prep_readiness_history', `where student_id = 'BB0001'`) === 3, 'readiness history keeps every change');
await as('att@ama.test', () => db.exec(`update prep_readiness set status = 'ready' where student_id = 'BB0002'`));
ok((await one(`select status from prep_readiness where student_id = 'BB0002'`)).status === 'not_assessed', 'attendance recorder cannot change readiness');

// ---------------------------------------------------------------------------
console.log('\nPayments');
const pay = async sid => (await one(`select payment_id from prep_payments where student_id = $1 and cycle_id = $2`, [sid, c1])).payment_id;
const P1 = await pay('BB0001'), P2 = await pay('BB0002'), P3 = await pay('BB0003');
await as('pay@ama.test', () => db.exec(`
  insert into prep_payment_transactions (payment_id, type, amount, method, reference) values ('${P1}', 'payment', 120, 'cash', 'R-100');
  insert into prep_payment_transactions (payment_id, type, amount, method, reference) values ('${P2}', 'payment', 50, 'bank_transfer', 'R-101');
  insert into prep_payment_transactions (payment_id, type, amount, method, reference) values ('${P2}', 'payment', 20, 'cash', 'R-102');`));
const ps = async id => one(`select * from prep_payment_summary where payment_id = $1`, [id]);
ok((await ps(P1)).status === 'paid' && Number((await ps(P1)).balance) === 0, 'full payment shows Paid, balance 0');
const p2 = await ps(P2);
ok(Number(p2.amount_paid) === 70 && Number(p2.balance) === 50 && p2.transactions === 2, 'instalments recorded separately and totalled (70 paid, 50 owing)');
ok(['partially_paid','overdue'].includes(p2.status), 'part payment shows Partially paid (or Overdue after the due date)');
await fails(() => as('pay@ama.test', () => db.exec(`insert into prep_payment_transactions (payment_id, type, amount, reference) values ('${P2}', 'payment', 20, ' r-102 ')`)), /duplicate key/, 'same receipt number twice is blocked');
await as('pay@ama.test', () => db.exec(`update prep_payment_transactions set amount = 1 where payment_id = '${P2}'`));
await as(ADMIN, () => db.exec(`delete from prep_payment_transactions where payment_id = '${P2}'`));
ok(Number((await ps(P2)).amount_paid) === 70 && (await ps(P2)).transactions === 2, 'transactions cannot be edited or deleted, even by an admin');
await fails(() => db.exec(`update prep_payment_transactions set amount = 1 where payment_id = '${P2}'`), /cannot be changed/, 'even bypassing the app, transactions are locked');
await fails(() => as('pay@ama.test', () => db.exec(`insert into prep_payment_transactions (payment_id, type, amount) values ('${P2}', 'correction', -20)`)), /check constraint/, 'a correction needs a note');
await as('pay@ama.test', () => db.exec(`insert into prep_payment_transactions (payment_id, type, amount, notes) values ('${P2}', 'correction', -20, 'R-102 entered in error')`));
ok(Number((await ps(P2)).amount_paid) === 50, 'correction adjusts the total without changing earlier transactions');
await fails(() => as('pay@ama.test', () => db.exec(`update prep_payments set status_override = 'waived' where payment_id = '${P3}'`)), /check constraint/, 'a waiver needs a reason');
await as('pay@ama.test', () => db.exec(`update prep_payments set status_override = 'waived', override_reason = 'Committee approved' where payment_id = '${P3}'`));
ok((await ps(P3)).status === 'waived', 'approved fee waiver');
ok((await one(`select status from prep_attendance_summary s join prep_readiness r using (student_id, cycle_id) where student_id = 'BB0003'`)).status === 'not_assessed', 'payment does not change readiness');
for (const who of ['view@ama.test', 'inst@ama.test', 'att@ama.test', 'grade@ama.test']) {
  ok((await as(who, () => rows(`select * from prep_payment_transactions`))).length === 0
     && (await as(who, () => rows(`select * from prep_payment_summary`))).length === 0, `${who.split('@')[0]} cannot see payment information`);
}
const ov = await as('view@ama.test', () => one(`select * from prep_overview where student_id = 'BB0002'`));
ok(ov && ov.payment_status === null && ov.balance === null && ov.readiness === 'not_assessed', 'overview hides payment columns from non-payment users');
ok((await as('pay@ama.test', () => one(`select balance from prep_overview where student_id = 'BB0002'`))).balance !== null, 'payments role sees balances in the overview');
await as(ADMIN, () => db.exec(`update prep_cycles set session_fee = 130 where cycle_id = '${c1}'`));
ok(Number((await ps(P2)).amount_due) === 130, 'changing the cycle fee updates fees still at the old amount');

// ---------------------------------------------------------------------------
console.log('\nSecond cycle keeps history');
const before = await rows(`select attendance_id, status from prep_attendance where cycle_id = $1 order by attendance_id`, [c1]);
const c2 = (await as(ADMIN, () => one(`select prep_start_new_cycle('Term 4 2026', '2026-10-12', '2026-11-02', null, 120) id`))).id;
await fails(() => as(ADMIN, () => db.query(`select prep_activate_cycle($1)`, [c2])), /already active/, 'only one active cycle unless allowed');
await as(ADMIN, () => db.query(`select prep_activate_cycle($1, true)`, [c2]));
ok((await one(`select status from prep_cycles where cycle_id = $1`, [c1])).status === 'completed', 'previous cycle completed on confirmation');
const after = await rows(`select attendance_id, status from prep_attendance where cycle_id = $1 order by attendance_id`, [c1]);
ok(JSON.stringify(before) === JSON.stringify(after), 'previous cycle attendance unchanged');
ok((await one(`select status from prep_readiness where student_id = 'BB0001' and cycle_id = $1`, [c2])).status === 'not_assessed', 'readiness starts fresh in the new cycle');
const newPay = await one(`select * from prep_payment_summary where student_id = 'BB0001' and cycle_id = $1`, [c2]);
ok(newPay.status !== 'paid' && Number(newPay.amount_paid) === 0, 'paid last cycle does not count as paid for the new cycle');
ok((await one(`select status from prep_readiness where student_id = 'BB0001' and cycle_id = $1`, [c1])).status === 'ready', 'previous readiness kept');

// ---------------------------------------------------------------------------
console.log('\nGrading');
await fails(() => as('grade@ama.test', () => db.exec(`insert into prep_grading (student_id, cycle_id, grading_event, target_rank, eligibility_decision)
  values ('BB0002', '${c1}', 'Dan grading Aug 2026', '2nd Dan', 'eligible')`)), /Give a reason/, 'eligible without meeting attendance or readiness needs a reason');
await as('grade@ama.test', () => db.exec(`insert into prep_grading (student_id, cycle_id, grading_event, target_rank, eligibility_decision, decision_reason)
  values ('BB0002', '${c1}', 'Dan grading Aug 2026', '2nd Dan', 'eligible', 'Head instructor approved')`));
const g2 = await one(`select * from prep_grading where student_id = 'BB0002'`);
ok(g2.attendance_eligible === false && g2.readiness_at_review === 'not_assessed' && g2.decided_by === 'grade@ama.test', 'override recorded with the facts at the time');
await as('grade@ama.test', () => db.exec(`insert into prep_grading (student_id, cycle_id, grading_event, target_rank) values ('BB0001', '${c1}', 'Dan grading Aug 2026', '1st Dan')`));
ok((await one(`select eligibility_decision, status from prep_grading where student_id = 'BB0001'`)).eligibility_decision === 'pending', 'attendance and payment never make a student eligible automatically');
await as('grade@ama.test', () => db.exec(`update prep_grading set result = 'passed' where student_id = 'BB0001'`));
ok((await one(`select status from prep_grading where student_id = 'BB0001'`)).status === 'passed', 'grading result recorded');
await fails(() => as('inst@ama.test', () => db.exec(`update prep_grading set result = 'passed' where student_id = 'BB0002'`).then(async () => {
  if ((await one(`select result from prep_grading where student_id = 'BB0002'`)).result) throw new Error('changed');
  throw new Error('blocked');
})), /blocked/, 'instructor cannot record grading results');

// ---------------------------------------------------------------------------
console.log('\nCertificates');
const gid = sid => one(`select grading_id from prep_grading where student_id = $1`, [sid]).then(r => r.grading_id);
await fails(() => as('cert@ama.test', async () => db.exec(`insert into prep_certificates (student_id, grading_id, certificate_name, status)
  values ('BB0002', '${await gid('BB0002')}', 'Jordan Lee', 'issued')`)), /passed grading/, 'certificate cannot be issued without a pass');
await as('cert@ama.test', async () => db.exec(`insert into prep_certificates (student_id, grading_id, certificate_name, awarded_rank, certificate_number, status)
  values ('BB0001', '${await gid('BB0001')}', 'Alexander Smith', '1st Dan', 'AMA-2026-001', 'issued')`));
const ce = await one(`select * from prep_certificates where student_id = 'BB0001'`);
ok(ce.status === 'issued' && ce.issue_date, 'certificate issued for a pass, issue date filled in');
ok((await as('view@ama.test', () => one(`select certificate_status, grading_result from prep_overview where student_id = 'BB0001' and cycle_id = $1`, [c1]))).certificate_status === 'issued', 'certificate status shows in the overview');

// ---------------------------------------------------------------------------
console.log('\nID cards and the card software');
await db.exec(`insert into people (name, dob, dan, photo_path) values ('Jordan Lee', '2008-07-12', '1st Dan', 'photos/j.jpg')`); // already in card software
await fails(() => as('view@ama.test', () => db.query(`select prep_send_to_card_software('BB0001', '1st Dan')`)), /permission/, 'viewer cannot send to the card software');
const pid = (await as('card@ama.test', () => one(`select prep_send_to_card_software('BB0001', '1st Dan') id`))).id;
const person = await one(`select * from people where id = $1`, [pid]);
ok(person.student_id === 'BB0001' && person.dan === '1st Dan', 'passed student added to the card software with their Student ID');
const cardStatus = sid => as('card@ama.test', () => one(`select status from prep_id_card_status where student_id = $1`, [sid])).then(r => r?.status);
ok(await cardStatus('BB0001') === 'details_incomplete', 'no photo yet: Details incomplete');
await db.exec(`update people set photo_path = 'photos/a.jpg' where id = '${pid}'`);
ok(await cardStatus('BB0001') === 'ready_for_printing', 'photo added: Ready for printing');
const job1 = (await one(`insert into print_jobs (people_ids, people_names, card_count, pdf_path) values (array['${pid}']::uuid[], array['Alex Smith'], 1, 'jobs/1.pdf') returning id`)).id;
ok(await cardStatus('BB0001') === 'sent_for_printing', 'in the print queue: Sent for printing');
await db.exec(`update print_jobs set status = 'printed', printed_at = now() where id = '${job1}'`);
ok(await cardStatus('BB0001') === 'printed', 'card software prints it: Printed');
await as('card@ama.test', () => db.exec(`update prep_id_cards set ready_to_collect_at = now() where student_id = 'BB0001'`));
ok(await cardStatus('BB0001') === 'awaiting_collection', 'Awaiting collection');
await as('card@ama.test', () => db.exec(`update prep_id_cards set collected_at = now() where student_id = 'BB0001'`));
ok(await cardStatus('BB0001') === 'collected', 'Collected');
await db.exec(`update people set dan = '2nd Dan' where id = '${pid}'`);
ok(await cardStatus('BB0001') === 'reprint_required', 'card details change after printing: Reprint required');
const job2 = (await one(`insert into print_jobs (people_ids, card_count, pdf_path) values (array['${pid}']::uuid[], 1, 'jobs/2.pdf') returning id`)).id;
await db.exec(`update print_jobs set status = 'printed', printed_at = now() + interval '1 second' where id = '${job2}'`);
await as('card@ama.test', () => db.exec(`insert into prep_print_event_notes (print_job_id, student_id, reprint_reason) values ('${job2}', 'BB0001', 'Dan updated')`));
const hist = await as('card@ama.test', () => rows(`select * from prep_card_print_history() where student_id = 'BB0001' and status = 'printed' order by created_at`));
ok(hist.length === 2 && hist[0].print_number === 1 && hist[1].print_number === 2, 'reprint is a new print event; the original is kept');
ok(await cardStatus('BB0001') === 'printed', 'after the reprint, earlier collection does not count');

const existing = (await one(`select id from people where name = 'Jordan Lee'`)).id;
await as('card@ama.test', () => db.query(`select prep_send_to_card_software('BB0002', '2nd Dan', $1)`, [existing]));
const jl = await one(`select * from people where id = $1`, [existing]);
ok(jl.student_id === 'BB0002' && jl.dan === '1st Dan' && Number((await one(`select count(*) n from people where name = 'Jordan Lee'`)).n) === 1,
   'existing card person linked without duplicating or overwriting their details');
await fails(() => db.exec(`update people set student_id = 'BB0002' where id = '${pid}'`), /duplicate key/, 'two card records cannot share a Student ID');
ok((await as('nobody@ama.test', () => rows(`select * from prep_card_people()`))).length === 0, 'people without a prep role see no card data');

// Card software still works as before
await as(ADMIN, () => db.exec(`insert into people (name) values ('Pasted Member')`));
ok(await cnt('people', `where name = 'Pasted Member' and student_id is null`) === 1, 'card software can still add people without a Student ID');

// ---------------------------------------------------------------------------
console.log('\nAccess and audit');
for (const t of ['prep_students', 'prep_attendance', 'prep_overview', 'prep_cycles']) {
  ok((await as('nobody@ama.test', () => rows(`select * from ${t}`))).length === 0, `no prep role: nothing visible in ${t}`);
}
await fails(() => as('inst@ama.test', () => db.exec(`insert into prep_roles (email, role) values ('inst@ama.test', 'admin')`)), /row-level security/, 'non-admins cannot give themselves roles');
await fails(() => as(ADMIN, () => db.exec(`delete from prep_roles where role = 'admin'`)), /at least one admin/, 'the last admin cannot be removed');
ok(await cnt('prep_audit_log', `where table_name = 'prep_attendance' and changed_by = 'att@ama.test'`) > 0, 'attendance changes are in the audit log');
ok((await as('inst@ama.test', () => rows(`select * from prep_audit_log`))).length === 0, 'only admins can read the audit log');
await fails(() => as(ADMIN, () => db.exec(`delete from prep_enrolments where student_id = 'BB0002' and cycle_id = '${c1}'`)), /foreign key/, 'an enrolment with payments cannot be removed');
await as(ADMIN, () => db.exec(`delete from prep_enrolments where student_id = 'BB0003' and cycle_id = '${c2}'`));
ok(await cnt('prep_attendance', `where student_id = 'BB0003' and cycle_id = $1`, [c2]) === 0, 'a mistaken enrolment with no payments can be removed');

const noRls = await rows(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'prep\\_%' and not c.relrowsecurity`);
ok(noRls.length === 0, 'every prep table has row level security on' + (noRls.length ? ': missing ' + noRls.map(r => r.relname) : ''));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
