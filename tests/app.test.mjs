// Browser tests for the Black Belt Prep app (Stage 3: students, cycles, attendance).
// Runs the real app in headless Chromium at phone size, against a local stand-in for Supabase
// that uses the real database rules (card software SQL + prep-setup.sql).
//
//   cd tests && npm install && CARD_REPO=/path/to/ama-id-cards node app.test.mjs
// Screenshots are written to tests/screenshots/.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './fake-supabase.mjs';
import { createRequire } from 'node:module';
const XLSX = createRequire(import.meta.url)('xlsx');

const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright/index.mjs');
const here = dirname(fileURLToPath(import.meta.url));
const CARD = process.env.CARD_REPO || join(here, '../../theggatonklenner/ama-id-cards');
const SHOTS = join(here, 'screenshots'); mkdirSync(SHOTS, { recursive: true });
const read = p => readFileSync(p, 'utf8');

// ---------- Database ----------
const db = new PGlite();
await db.exec(read(join(here, 'supabase-stub.sql')));
await db.exec(`insert into auth.users (email) values ('owner@ama.test')`);
for (const f of ['setup.sql', 'roles.sql', 'printed.sql']) await db.exec(read(join(CARD, 'supabase', f)));
await db.exec(read(join(here, '../supabase/prep-setup.sql')));
await db.exec(read(join(here, '../supabase/prep-update-01.sql')));
await db.exec(read(join(here, '../supabase/prep-update-02.sql')));
await db.exec(read(join(here, '../supabase/prep-update-03.sql')));
await db.exec(read(join(here, '../supabase/prep-update-04.sql')));
await db.exec(read(join(here, '../supabase/prep-update-05.sql')));
await db.exec(read(join(here, '../supabase/prep-update-06.sql')));
await db.exec(read(join(here, '../supabase/prep-update-07.sql')));
await db.exec(read(join(here, '../supabase/prep-update-08.sql')));
await db.exec(`insert into prep_roles (email, role) values ('att@ama.test','attendance'), ('view@ama.test','viewer');
  update prep_settings set default_session_fee = 120;
  insert into prep_dan_counters (target_rank, next_number) values ('Probationary Black Belt', 501), ('1st Dan Black Belt', 701);`);

const users = Object.fromEntries(['owner@ama.test', 'att@ama.test', 'view@ama.test', 'nobody@ama.test']
  .map((e, i) => [e, { id: `00000000-0000-0000-0000-00000000000${i + 1}`, password: 'pw' }]));
const server = await startServer({ db, appDir: join(here, '../docs'), users, config: '' });
const BASE = `http://localhost:${server.address().port}`;
const configJs = `window.PREP_CONFIG = { SUPABASE_URL: '${BASE}', SUPABASE_ANON_KEY: 'test-anon-key' };`;
const q = server.q;
const addDaysIso = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------- Browser ----------
const browser = await chromium.launch();
let passed = 0, failed = 0, shotN = 0;
const ok = (c, name) => { if (c) { passed++; console.log('  pass  ' + name); } else { failed++; console.log('  FAIL  ' + name); } };
const consoleErrors = [];

async function open(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-AU', timezoneId: 'Australia/Sydney' });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: read(join(here, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js')) }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/xlsx/**', r => r.fulfill({ contentType: 'text/javascript', body: read(join(here, 'node_modules/xlsx/dist/xlsx.full.min.js')) }));
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs }));
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/websocket|realtime|ERR_CONNECTION|Failed to load resource/i.test(m.text())) consoleErrors.push(`${email}: ${m.text()}`); });
  page.on('pageerror', e => consoleErrors.push(`${email}: ${e.message}`));
  await page.goto(BASE + '/');
  if (email) {
    await page.fill('#loginEmail', email); await page.fill('#loginPassword', 'pw');
    await page.click('#loginBtn');
    await page.waitForFunction(() => !document.querySelector('#app').hidden || !document.querySelector('#noAccessView').hidden, null, { timeout: 8000 });
    // Wait for the data to finish loading
    await page.waitForFunction(() => !document.querySelector('#noAccessView').hidden || !document.querySelector('#view-dashboard').textContent.includes('Loading'), null, { timeout: 8000 });
  }
  return { ctx, page };
}
const shot = async (page, name) => page.screenshot({ path: join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`), fullPage: false });
const confirm = async page => { await page.waitForSelector('#askDlg[open]'); const t = await page.textContent('#askText'); await page.click('#askYes'); await page.waitForSelector('#askDlg:not([open])', { state: 'attached' }); return t; };
const tab = async (page, v) => {
  if (['cycles', 'payments', 'grading', 'certificates', 'reports'].includes(v)) { await page.click('.tab[data-view="more"]'); await page.click(`[data-goto="${v}"]`); }
  else await page.click(`.tab[data-view="${v}"]`);
};
const settle = page => page.waitForTimeout(450);
const toastText = async page => { await page.waitForSelector('#toast:not([hidden])'); return page.textContent('#toast'); };

try {
  // ------------------------------------------------------------------
  console.log('Sign in');
  {
    const { ctx, page } = await open(null);
    ok(await page.isVisible('#authView'), 'sign-in screen shown when signed out');
    await page.fill('#loginEmail', 'owner@ama.test'); await page.fill('#loginPassword', 'wrong'); await page.click('#loginBtn');
    await page.waitForSelector('#loginError:not([hidden])');
    ok((await page.textContent('#loginError')).includes('Wrong email or password'), 'wrong password shows a clear message');
    await ctx.close();
    const n = await open('nobody@ama.test');
    ok(await n.page.isVisible('#noAccessView'), 'login without a prep role sees "No access yet"');
    await shot(n.page, 'no-access');
    await n.ctx.close();
  }

  // ------------------------------------------------------------------
  console.log('\nStudents');
  const { ctx, page } = await open('owner@ama.test');
  await page.waitForFunction(() => document.querySelector('#view-dashboard').textContent.includes('Dashboard'));
  ok(await page.isVisible('#view-dashboard') && (await page.textContent('#view-dashboard')).includes('No preparation cycle is active'), 'admin lands on the dashboard; no active cycle yet');
  await shot(page, 'dashboard-empty');
  await tab(page, 'students');
  await page.click('#addStudentBtn');
  await page.fill('#fName', 'Alex Smith'); await page.selectOption('#fRank', 'Cho Dan Bo');
  ok(!(await page.$('#fDob')) && !(await page.$('#fEmail')) && !(await page.$('#fPhone')), 'student form has no birth date, email or phone');
  await shot(page, 'add-student');
  await page.click('#fSave');
  ok((await toastText(page)).includes('as BB0001'), 'student added and given Student ID BB0001');
  await page.waitForSelector('#sheet #stEdit');
  await page.click('#sheet [data-close]');
  await page.click('#addStudentBtn');
  await page.fill('#fName', 'ALEX  smith'); await page.click('#fSave');
  const dupText = await page.textContent('#askText', { timeout: 3000 }).catch(() => '');
  ok(dupText.includes('Alex Smith (BB0001'), 'adding a matching name warns about a possible duplicate');
  await page.click('#askNo'); await page.click('#sheet [data-close]');
  ok((await q(`select count(*)::int n from prep_students`))[0].n === 1, 'cancelled duplicate was not saved');

  await page.click('#importStudentsBtn');
  await page.fill('#impText', [
    'First name,Last name,Belt,Phone,Student ID',
    'Jordan,Lee,cho dan bo,0400 000 000,',
    'Taylor,Brown,3rd dan lvl 2,,',
    'alex,smith,,,',
    'Riley,Chen,Cho Dan Bo,,M-0042',
    'Jordan,Lee,,,',
    'Kim,Park,Blue belt,,'
  ].join('\n'));
  await page.waitForSelector('#impPreview table');
  const prev = await page.textContent('#impPreview');
  ok(prev.includes('3 to add') && prev.includes('3 skipped'), 'import preview: 3 to add, 3 skipped (extra columns such as Phone ignored)');
  ok(prev.includes('Already in the register') && prev.includes('Repeated in this list') && prev.includes('"Blue belt" is not in the list'),
     'preview explains each skipped row (existing, repeated, unknown belt)');
  await shot(page, 'import-preview');
  await page.click('#impGo'); await confirm(page); await settle(page);
  const imported = await q(`select student_id, full_name, contact_phone from prep_students order by student_id`);
  ok(imported.length === 4 && imported.some(s => s.student_id === 'M-0042'), 'import kept the supplied Student ID');
  ok(imported.every(s => !s.contact_phone), 'phone numbers in the file are not stored');
  const belts = Object.fromEntries((await q(`select full_name, belt_rank from prep_students`)).map(r => [r.full_name, r.belt_rank]));
  ok(belts['Jordan Lee'] === 'Cho Dan Bo' && belts['Taylor Brown'] === '3rd Dan Level 2', 'imported belts matched to the list ("cho dan bo", "3rd dan lvl 2")');
  const opts = await page.$$eval('#studentBelt option', os => os.map(o => o.textContent));
  ok(opts.slice(1, 4).join('|') === 'Cho Dan Bo|Probationary Black Belt|1st Dan Black Belt' && opts[opts.length - 1] === '9th Dan' && opts.length === 27 && opts.includes('5th Dan Level 5'), 'belt list is in grading order, Cho Dan Bo to 9th Dan');
  // The way the club's list is written: tab-separated, belts in words
  await page.click('#importStudentsBtn');
  await page.fill('#impText', 'Name\tBelt\nIvy Abbatantuono\tFirst Dan\nDali Connelly\tThird Dan Level 1\nPersia Dowling\tThird Dan Level 2\nMichael Esen\tThird Dan\nBillie-Rose Barton-Hall\tFirst Dan');
  await page.waitForSelector('#impPreview table');
  const wp = await page.textContent('#impPreview');
  ok(wp.includes('5 to add') && !wp.includes('not in the list'), 'belts written in words ("First Dan", "Third Dan Level 1") are recognised');
  await page.click('#sheet [data-close]');
  await page.click('#addStudentBtn'); await page.fill('#fName', 'Test Student'); await page.check('#fTest'); await page.click('#fSave'); await page.waitForSelector('#sheet #stEdit'); await page.click('#sheet [data-close]');
  ok((await page.textContent('#studentList')).includes('Test Student') === false, 'test records hidden from the list by default');
  await page.check('#studentShowTest');
  ok((await page.textContent('#studentList')).includes('Test Student'), '"Show test records" reveals them');
  await page.uncheck('#studentShowTest');
  await page.fill('#studentSearch', 'lee');
  ok((await page.$$('#studentList [data-student]')).length === 1, 'search filters the list');
  await page.fill('#studentSearch', '');
  await page.selectOption('#studentBelt', 'Cho Dan Bo');
  ok((await page.$$('#studentList [data-student]')).length === 3, 'belt filter works');
  await page.selectOption('#studentBelt', '');
  ok(!(await page.textContent('#view-students')).toLowerCase().includes('club'), 'no club or school shown');
  await shot(page, 'students');

  await page.click('#studentList [data-student="BB0002"]');
  await page.click('#stEdit'); await page.fill('#fCert', 'Jordan Michael Lee'); await page.click('#fSave'); await settle(page);
  ok((await q(`select certificate_name from prep_students where student_id = 'BB0002'`))[0].certificate_name === 'Jordan Michael Lee', 'student edited');
  await page.click('#stActive'); await confirm(page); await settle(page);
  ok((await q(`select is_active from prep_students where student_id = 'BB0002'`))[0].is_active === false, 'student deactivated (record kept)');
  await page.click('#stActive'); await settle(page);
  ok((await q(`select is_active from prep_students where student_id = 'BB0002'`))[0].is_active === true, 'student reactivated');
  await page.click('#sheet [data-close]');

  // ------------------------------------------------------------------
  console.log('\nPreparation cycles');
  await tab(page, 'cycles');
  await page.click('#newCycleBtn');
  await page.fill('#ncName', 'Term 4 2026');
  ok(!(await page.$('#ncStart')) && !(await page.$('#ncEnd')), 'no cycle start or end date, only session dates');
  ok(!(await page.$('#ncDue')), 'no payment due date for session fees');
  ok((await page.textContent('label[for=ncS4]')).includes('Sign-off'), 'session 4 is labelled as the sign-off');
  await page.fill('#ncS1', '2026-10-05'); await page.dispatchEvent('#ncS1', 'change');
  ok(await page.inputValue('#ncS2') === '2026-10-19' && await page.inputValue('#ncS4') === '2026-11-16', 'sessions 2 to 4 filled in every two weeks from session 1');
  ok(await page.inputValue('#ncGrade') === '2026-11-30', 'grading date filled in two weeks after the sign-off');
  ok(await page.inputValue('#ncFee') === '200.00' && await page.inputValue('#ncPer') === '60.00', 'fees default to $200 upfront and $60 per session');
  await shot(page, 'new-cycle');
  await page.click('#ncGo');
  const review = await confirm(page);
  ok(review.includes('4 students enrolled') && review.includes('becomes the active cycle') && review.includes('sign-off on') && review.includes('Grading on') && review.includes('$200 upfront or $60 per session'), 'review step summarises the cycle, sign-off, grading date and fees');
  await page.waitForSelector('#cyclePill:not([hidden])');
  ok((await page.textContent('#cyclePillText')) === 'Term 4 2026', 'new cycle is active and shown in the header');
  const c1 = (await q(`select cycle_id, status from prep_cycles where name = 'Term 4 2026'`))[0];
  ok(c1.status === 'active', 'cycle saved as active');
  ok((await q(`select count(*)::int n from prep_attendance where cycle_id = $1 and status = 'not_recorded'`, [c1.cycle_id]))[0].n === 16, 'fresh attendance created for 4 students x 4 sessions');
  const cyc = (await q(`select grading_date::text g, start_date::text s, end_date::text e from prep_cycles where cycle_id = $1`, [c1.cycle_id]))[0];
  ok(cyc.g === '2026-11-30' && cyc.s === '2026-10-05' && cyc.e === '2026-11-16', 'grading date saved; cycle span taken from the session dates');
  const dans = Object.fromEntries((await q(`select student_id, dan_number, target_rank from prep_dan_numbers`)).map(r => [r.student_id, r]));
  ok(dans.BB0001?.dan_number === 501 && dans.BB0002?.dan_number === 502 && dans['M-0042']?.dan_number === 503 && !dans.BB0003,
     'Dan numbers 501 to 503 given in name order to the Cho Dan Bo students; the 3rd Dan Level 2 student gets none');
  await page.click('#newCycleBtn'); await page.fill('#ncName', 'term 4 2026'); await page.fill('#ncS1', '2026-10-05'); await page.dispatchEvent('#ncS1', 'change');
  await page.click('#ncGo');
  ok((await toastText(page)).includes('already exists'), 'starting a cycle with the same name is stopped');
  await page.click('#sheet [data-close]');
  await page.click(`[data-cycle="${c1.cycle_id}"]`);
  await page.fill('#cySess2', '2026-10-13'); await page.click('#cySave'); await settle(page);
  ok((await q(`select session_date::text d from prep_sessions where cycle_id = $1 and session_number = 2`, [c1.cycle_id]))[0].d === '2026-10-13', 'session date edited');
  await shot(page, 'cycle-detail');
  await page.click('#sheet [data-close]');

  // ------------------------------------------------------------------
  console.log('\nAttendance');
  await tab(page, 'attendance');
  await page.click('#attBody [data-session="1"]');
  await page.click('.att button[data-id="BB0001"][data-s="present"]'); await settle(page);
  const a1 = (await q(`select a.status, a.recorded_by from prep_attendance a join prep_sessions s using (session_id) where s.cycle_id = $1 and s.session_number = 1 and a.student_id = 'BB0001'`, [c1.cycle_id]))[0];
  ok(a1.status === 'present' && a1.recorded_by === 'owner@ama.test', 'one tap marks a student present and records who did it');
  ok(await page.getAttribute('.att button[data-id="BB0001"][data-s="present"]', 'aria-pressed') === 'true', 'button shows the recorded status');
  await page.click('#attSelect');
  await page.check('[data-pick="BB0002"]'); await page.check('[data-pick="BB0003"]');
  await shot(page, 'attendance-select');
  await page.click('#selbar [data-bulk="absent"]');
  const absTxt = await confirm(page);
  ok(absTxt.includes('ABSENT') && absTxt.includes('Only the students you selected'), 'bulk absent asks for explicit confirmation');
  await settle(page);
  const s1 = await q(`select a.student_id, a.status from prep_attendance a join prep_sessions s using (session_id) where s.cycle_id = $1 and s.session_number = 1 order by 1`, [c1.cycle_id]);
  ok(s1.find(r => r.student_id === 'BB0002').status === 'absent' && s1.find(r => r.student_id === 'BB0003').status === 'absent', 'selected students marked absent');
  ok(s1.find(r => r.student_id === 'M-0042').status === 'not_recorded' && s1.find(r => r.student_id === 'BB0001').status === 'present', 'students not selected were not changed');
  ok(await page.isHidden('#selbar'), 'selection mode closes after a bulk change');
  await page.click('.att button[data-id="BB0002"][data-s="excused"]'); await settle(page);
  ok((await q(`select a.status from prep_attendance a join prep_sessions s using (session_id) where s.cycle_id = $1 and s.session_number = 1 and a.student_id = 'BB0002'`, [c1.cycle_id]))[0].status === 'excused', 'recorded attendance can be corrected');
  // Prepaying: Riley hasn't been marked for session 1 yet
  ok(!(await page.isDisabled('.att .pay[data-pay="M-0042"]')), '$ works before a student is marked present (prepaying)');
  await page.click('.att .pay[data-pay="M-0042"]'); await settle(page);
  const pre = await q(`select t.amount::text a from prep_payment_transactions t join prep_sessions s using (session_id) where s.cycle_id = $1 and s.session_number = 1 and t.student_id = 'M-0042'`, [c1.cycle_id]);
  ok(pre.length === 1 && pre[0].a === '60.00', 'prepaid $60 recorded against session 1');
  ok((await q(`select a.status from prep_attendance a join prep_sessions s using (session_id) where s.cycle_id = $1 and s.session_number = 1 and a.student_id = 'M-0042'`, [c1.cycle_id]))[0].status === 'not_recorded', 'prepaying does not mark attendance');
  await page.waitForFunction(() => document.querySelector('#attBody .counts')?.textContent.includes('1 prepaid'), null, { timeout: 5000 }).catch(() => {});
  ok((await page.textContent('#attBody .counts')).includes('1 prepaid'), 'session shows how many have prepaid');
  const credit = (await q(`select s.balance::text b, s.status from prep_payment_summary s where s.cycle_id = $1 and s.student_id = 'M-0042' and s.kind = 'sessions'`, [c1.cycle_id]))[0];
  ok(Number(credit.b) === -60 && credit.status === 'paid', 'before attending, the prepayment shows as a $60 credit');
  await page.click('.att .pay[data-pay="M-0042"]'); await confirm(page); await settle(page);
  await page.click('.att .pay[data-pay="BB0001"]'); await settle(page);
  const paidTx = await q(`select t.amount::text a, t.method, t.notes from prep_payment_transactions t join prep_sessions s using (session_id) where s.cycle_id = $1 and s.session_number = 1 and t.student_id = 'BB0001'`, [c1.cycle_id]);
  ok(paidTx.length === 1 && paidTx[0].a === '60.00' && paidTx[0].notes === 'Paid at session 1', 'one tap on $ records $60 paid at that session');
  await page.waitForFunction(() => document.querySelector('#attBody .counts')?.textContent.includes('1 of 1 present paid'), null, { timeout: 5000 }).catch(() => {});
  ok(await page.getAttribute('.att .pay[data-pay="BB0001"]', 'aria-pressed') === 'true' && (await page.textContent('#attBody .counts')).includes('1 of 1 present paid'), '$ shows as paid and the session count updates');
  await shot(page, 'attendance-paid');
  await page.click('.att .pay[data-pay="BB0001"]'); const undoTxt = await confirm(page); await settle(page);
  ok(undoTxt.includes('Undo') && Number((await q(`select amount_paid from prep_payment_summary p join prep_cycles c using (cycle_id) where c.cycle_id = $1 and p.student_id = 'BB0001'`, [c1.cycle_id]))[0].amount_paid) === 0, 'tapping $ again undoes the payment after confirming');
  await page.click('.att .pay[data-pay="BB0001"]'); await settle(page);

  await page.click('#attBody [data-session="2"]');
  await page.selectOption('#attBelt', 'Cho Dan Bo');
  await page.click('#attAllPresent'); const allTxt = await confirm(page); await settle(page);
  ok(/Mark 3 students present/.test(allTxt), '"Mark shown as present" only covers the filtered students (3 at Cho Dan Bo)');
  const s2 = await q(`select a.student_id, a.status from prep_attendance a join prep_sessions s using (session_id) where s.cycle_id = $1 and s.session_number = 2`, [c1.cycle_id]);
  ok(s2.filter(r => r.status === 'present').length === 3 && s2.find(r => r.student_id === 'BB0003').status === 'not_recorded', 'student on another belt left unrecorded');
  await page.selectOption('#attBelt', '');
  await shot(page, 'attendance');

  await page.click('#attImport');
  await page.fill('#impText', 'Student ID,Name,Session,Status\nBB0003,,2,P\n,Jordan Lee,3,absent\n,Nobody Here,3,P\nBB0001,,7,P\nBB0001,,3,maybe\nBB0001,,2,present\nZZ999,,2,P');
  await page.waitForSelector('#impPreview table');
  const ip = await page.textContent('#impPreview');
  ok(ip.includes('3 to record') && ip.includes('1 new student') && ip.includes('New student'), 'upload preview: a name not in the register becomes a new student');
  ok(ip.includes('Student ID ZZ999 not found') && ip.includes('No session 7') && ip.includes('not understood') && ip.includes('Already recorded'), 'upload preview flags unknown IDs, bad sessions, bad statuses and repeats');
  await shot(page, 'attendance-import');
  await page.click('#impGo'); await confirm(page); await settle(page);
  ok((await q(`select count(*)::int n from prep_attendance a join prep_sessions s using (session_id) where s.cycle_id = $1 and ((s.session_number = 2 and a.student_id = 'BB0003' and a.status = 'present') or (s.session_number = 3 and a.student_id = 'BB0002' and a.status = 'absent'))`, [c1.cycle_id]))[0].n === 2, 'uploaded attendance saved');
  const nobody = (await q(`select s.student_id, s.belt_rank, a.status from prep_students s join prep_attendance a using (student_id) join prep_sessions x using (session_id) where s.full_name = 'Nobody Here' and x.session_number = 3 and x.cycle_id = $1`, [c1.cycle_id]))[0];
  ok(nobody && nobody.status === 'present', 'new student created, added to the cycle and marked present for that session');

  // End of a session: upload a plain list of names (no heading row)
  await page.click('#attBody [data-session="3"]');
  await page.click('#attImport');
  await page.fill('#impText', 'Riley Chen\nBrand New,2nd Dan\nAlex Smith');
  await page.waitForSelector('#impPreview table');
  const ip2 = await page.textContent('#impPreview');
  ok(ip2.includes('3 to record') && ip2.includes('1 new student') && ip2.includes('2nd Dan'), 'plain list of names works; a belt next to a new name is used');
  await page.click('#impGo'); await confirm(page); await settle(page);
  const s3 = Object.fromEntries((await q(`select st.full_name, a.status, st.belt_rank from prep_attendance a join prep_sessions x using (session_id) join prep_students st using (student_id) where x.cycle_id = $1 and x.session_number = 3`, [c1.cycle_id])).map(r => [r.full_name, r]));
  ok(s3['Riley Chen'].status === 'present' && s3['Alex Smith'].status === 'present' && s3['Brand New']?.status === 'present' && s3['Brand New'].belt_rank === '2nd Dan', 'everyone on the list is marked present for session 3, including the new student');
  ok(s3['Taylor Brown'].status === 'not_recorded', 'people not on the list are not marked absent');

  ok((await page.textContent('#attBody [data-session="4"]')).includes('Sign-off'), 'attendance shows session 4 as the sign-off');
  await page.click('#attBody [data-session="4"]');
  ok((await page.textContent('#attBody')).includes('must be marked Present here to grade'), 'sign-off session explains the rule');
  await page.click('.att button[data-id="BB0002"][data-s="absent"]'); await settle(page);
  await page.click('#view-attendance [data-mode="summary"]');
  const sumTxt = await page.textContent('#attBody');
  ok(sumTxt.includes('present ÷ (present + absent)'), 'summary explains how the percentage is worked out');
  const alexPct = (await q(`select attendance_pct::text p from prep_attendance_summary where student_id = 'BB0001' and cycle_id = $1`, [c1.cycle_id]))[0].p;
  ok(alexPct === '100.0', 'unrecorded sessions do not lower the percentage (Alex 2 of 2 = 100%)');
  await shot(page, 'attendance-summary');
  await page.click('#view-attendance [data-mode="sessions"]');

  // ------------------------------------------------------------------
  console.log('\nDashboard');
  await tab(page, 'dashboard');
  const sel = await page.$$eval('.tab', ts => ts.map(t => t.dataset.view + '=' + t.getAttribute('aria-selected')).join(' '));
  ok(sel.includes('dashboard=true') && !sel.includes('attendance=true'), 'only the Dashboard tab is highlighted (' + sel + ')');
  const dash = await page.textContent('#view-dashboard');
  ok(dash.includes('Term 4 2026') && dash.includes('Needs attention'), 'dashboard shows the active cycle and a needs-attention list');
  ok(dash.includes('absence'), 'students with absences are listed for follow-up');
  ok(dash.includes('Missed the sign-off (absent)') && dash.includes('Grading · 30 Nov'), 'dashboard flags a missed sign-off and shows the grading date');
  await tab(page, 'students');
  ok((await page.textContent('#studentList')).includes('Dan no. 501'), 'student list shows Dan numbers');
  await tab(page, 'dashboard');
  await shot(page, 'dashboard');

  // ------------------------------------------------------------------
  console.log('\nNew cycle keeps history');
  const before = await q(`select attendance_id, status from prep_attendance where cycle_id = $1 order by 1`, [c1.cycle_id]);
  await tab(page, 'cycles');
  await page.click('#newCycleBtn');
  await page.fill('#ncName', 'Term 1 2027'); await page.fill('#ncS1', '2027-02-08'); await page.dispatchEvent('#ncS1', 'change');
  await page.check('[name=ncWho][value=pick]');
  await page.check('#ncList input[value="BB0001"]'); await page.check('#ncList input[value="M-0042"]');
  ok((await page.textContent('#ncActHint')).includes('Term 4 2026 will be marked Completed'), 'warns that the current cycle will be completed');
  await page.click('#ncGo'); const rv2 = await confirm(page);
  ok(rv2.includes('2 students enrolled') && rv2.includes('Term 4 2026 is marked Completed'), 'review lists chosen students and the cycle being completed');
  await page.waitForFunction(() => document.querySelector('#cyclePillText').textContent === 'Term 1 2027');
  const after = await q(`select attendance_id, status from prep_attendance where cycle_id = $1 order by 1`, [c1.cycle_id]);
  ok(JSON.stringify(before) === JSON.stringify(after), 'previous cycle attendance unchanged');
  ok((await q(`select status from prep_cycles where cycle_id = $1`, [c1.cycle_id]))[0].status === 'completed', 'previous cycle marked completed');
  await page.click('[data-cycle]:has-text("Term 1 2027")');
  await page.click('#cyEnrol'); await page.check('#enList input[value="BB0002"]'); await page.click('#enGo'); await settle(page);
  ok((await q(`select count(*)::int n from prep_attendance a join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and a.student_id = 'BB0002'`))[0].n === 4, 'student added mid-cycle gets attendance for every session');
  await page.click('[data-unenrol="BB0002"]'); await confirm(page); await settle(page);
  ok((await q(`select count(*)::int n from prep_enrolments e join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and e.student_id = 'BB0002'`))[0].n === 0, 'student added by mistake can be removed');
  await page.click('#sheet [data-close]');
  await tab(page, 'students'); await page.click('#studentList [data-student="BB0001"]');
  ok((await page.textContent('#sheet')).includes('Fee option'), 'student record shows the fee option');
  await page.selectOption('#sheet [data-plan]', 'upfront'); await settle(page);
  const t1 = (await q(`select c.cycle_id from prep_cycles c where c.name = 'Term 1 2027'`))[0].cycle_id;
  ok((await q(`select payment_plan, amount_due::text a from prep_payments where student_id = 'BB0001' and cycle_id = $1`, [t1]))[0].payment_plan === 'upfront', 'per session is the default; switched this student to upfront');
  const t4 = (await q(`select p.amount_due::text a from prep_payments p join prep_cycles c using (cycle_id) where c.name = 'Term 4 2026' and p.student_id = 'BB0001'`))[0].a;
  ok(t4 === '180.00', 'earlier cycle fee unchanged (per session: 3 sessions present x $60)');
  const hist = await page.textContent('#sheet');
  ok(hist.includes('Current cycle') && hist.includes('History') && hist.includes('Term 4 2026'), 'student record shows current cycle and history');
  await shot(page, 'student-detail');
  await page.click('#sheet [data-close]');

  // ------------------------------------------------------------------
  console.log('\nSettings and users');
  await tab(page, 'more');
  await page.waitForSelector('#userList ul');
  ok(await page.inputValue('#setDan0') === '504' && await page.inputValue('#setDan1') === '701' && await page.inputValue('#setDan2') === '', 'settings show a next Dan number for each rank (Probationary 504, 1st Dan 701, 2nd Dan not set)');
  await page.fill('#setDan2', '301');
  ok(!(await page.$('#setInv')) && !(await page.$('#setFee')), 'old settings (fees due on joining, single session fee) are gone');
  await page.fill('#setReq', '3'); await page.click('#setForm button[type=submit]'); await settle(page);
  ok((await q(`select sessions_required from prep_settings`))[0].sessions_required === 3, 'settings saved');
  ok((await q(`select next_number from prep_dan_counters where target_rank = '2nd Dan'`))[0]?.next_number === 301, 'next number for 2nd Dan saved');
  await page.click('#addUserBtn'); await page.fill('#uEmail', 'Coach@AMA.test'); await page.check('#uForm input[value="instructor"]'); await page.click('#uForm button[type=submit]'); await settle(page);
  ok((await q(`select role from prep_roles where email = 'coach@ama.test'`)).map(r => r.role).join() === 'instructor', 'admin adds a user with a role');
  await page.waitForSelector('#auditList table');
  ok((await page.textContent('#auditList')).includes('Attendance:'), 'recent changes list shows attendance changes');
  await page.evaluate(() => document.querySelector('#setForm .section').scrollIntoView()); await shot(page, 'more');
  await ctx.close();

  // ------------------------------------------------------------------
  console.log('\nGrading fees');
  {
    const { ctx, page } = await open('owner@ama.test');
    await tab(page, 'more'); await page.waitForSelector('#setForm');
    ok((await page.$$('#setForm [data-gfee]')).length === 25, 'Settings has a grading fee for each belt (25)');
    await page.fill('[data-gfee="Probationary Black Belt"]', '150'); await page.fill('[data-gfee="1st Dan Level 1"]', '90');
    await page.click('#setForm button[type=submit]'); await settle(page);
    ok((await q(`select fee::text f from prep_grading_fee_rates where target_rank = 'Probationary Black Belt'`))[0]?.f === '150.00', 'grading fee saved for Probationary Black Belt');
    await tab(page, 'cycles'); await page.click('[data-cycle]:has-text("Term 1 2027")');
    ok((await page.textContent('#sheet')).includes('Decide who grades on the Grading screen'), 'cycle points to the Grading screen');
    await page.click('#cyGrading');
    await page.waitForSelector('#grListItems [data-gr="BB0001"]');
    await page.click('#grListItems [data-gr="BB0001"]');
    ok((await page.textContent('#sheet')).includes('Not met'), 'grading record shows what is not met (attendance, readiness)');
    ok(!(await page.$('[name=grDec]')) && !(await page.$('#grDecSave')), 'there is no separate eligibility step');
    ok((await page.textContent('#sheet')).includes('$150'), 'Put forward shows the grading fee it will charge');
    await page.click('#grPut');
    ok((await toastText(page)).includes('Give a reason'), 'putting forward without meeting requirements needs a reason');
    await page.fill('#grReason', 'Head instructor approved'); await page.click('#grPut'); await confirm(page); await settle(page);
    const dec = (await q(`select g.eligibility_decision, g.decision_reason, g.decided_by, g.attendance_eligible, g.target_rank from prep_grading g join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and g.student_id = 'BB0001'`))[0];
    ok(dec && dec.eligibility_decision === 'eligible' && dec.decision_reason === 'Head instructor approved' && dec.attendance_eligible === false && dec.target_rank === 'Probationary Black Belt',
       'one button marks them eligible, with the reason and the attendance at the time');
    const gf = (await q(`select p.amount_due::text a, p.due_date::text d, p.target_rank, c.grading_date::text g from prep_payments p join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and p.student_id = 'BB0001' and p.kind = 'grading'`))[0];
    ok(gf && gf.a === '150.00' && gf.target_rank === 'Probationary Black Belt', 'ticking a Cho Dan Bo student charges the Probationary grading fee ($150)');
    ok(gf && gf.d === addDaysIso(gf.g, -21), 'grading fee due 3 weeks before the grading date');
    await page.waitForSelector('#sheet [data-res="passed"]');
    ok((await page.textContent('#sheet')).includes('Put forward'), 'grading record shows they are put forward');
    await page.click('#sheet [data-close]');
    await tab(page, 'students'); await page.click('#studentList [data-student="BB0001"]');
    const rec = await page.textContent('#sheet');
    ok(rec.includes('Yes, to Probationary Black Belt') && rec.includes('Grading fee'), 'student record shows grading and the grading fee');
    await page.click('#sheet [data-gpay]'); await page.selectOption('#gpMethod', 'bank_transfer'); await page.click('#gpGo'); await settle(page);
    ok((await q(`select s.status from prep_payment_summary s join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and s.student_id = 'BB0001' and s.kind = 'grading'`))[0].status === 'paid', 'grading fee payment recorded; fee shows as paid');
    await shot(page, 'grading-fee');
    await page.click('#sheet [data-close]');
    await tab(page, 'dashboard');
    ok((await page.textContent('#view-dashboard')).includes('Grading'), 'dashboard shows how many are grading');
    await ctx.close();
  }

  console.log('\nUpfront payment from the attendance screen');
  {
    const { ctx, page } = await open('owner@ama.test');
    await tab(page, 'attendance');
    await page.click('#attBody [data-session="1"]');
    ok(!(await page.isDisabled('.att .pay[data-pay="BB0001"]')), 'upfront student can pay before attendance is recorded');
    await page.click('.att .pay[data-pay="BB0001"]');
    const upTxt = await confirm(page); await settle(page);
    ok(upTxt.includes('$200 upfront') && upTxt.includes('covers all 4 sessions'), 'tapping $ for an upfront student records the $200 upfront fee after confirming');
    const up = (await q(`select s.amount_paid::text p, s.status from prep_payment_summary s join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and s.student_id = 'BB0001' and s.kind = 'sessions'`))[0];
    ok(up.p === '200.00' && up.status === 'paid', 'upfront fee paid in full');
    for (const n of [2, 3, 4]) {
      await page.click(`#attBody [data-session="${n}"]`);
      if (await page.getAttribute('.att .pay[data-pay="BB0001"]', 'aria-pressed') !== 'true') { ok(false, `session ${n} shows paid`); break; }
    }
    ok(true, 'every session then shows as paid');
    ok((await q(`select count(*)::int n from prep_attendance a join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and a.student_id = 'BB0001' and a.status <> 'not_recorded'`))[0].n === 0, 'attendance is left to be recorded separately');
    await ctx.close();
  }

  console.log('\nMark several as paid');
  {
    const { ctx, page } = await open('owner@ama.test');
    await tab(page, 'attendance');
    await page.click('#attBody [data-session="2"]');
    // Term 1 2027 session 2: Riley and the Oops-free students; mark Riley present first (per session)
    await page.click('.att button[data-id="M-0042"][data-s="present"]'); await settle(page);
    await page.click('#attSelect');
    await page.click('#selAll');
    ok(await page.isVisible('#bulkPaid'), 'selection bar has a Paid button');
    await page.click('#bulkPaid');
    await page.waitForSelector('#askDlg[open]');
    const pt = await page.textContent('#askText');
    ok(pt.includes('1 × $60 for session 2') && pt.includes('Skipped') && pt.includes('already paid'), 'confirmation lists who is charged and who is skipped (Alex already paid upfront)');
    await page.click('#askYes'); await page.waitForSelector('#askDlg:not([open])', { state: 'attached' }); await settle(page);
    const rp = await q(`select count(*)::int n from prep_payment_transactions t join prep_sessions s using (session_id) join prep_cycles c on c.cycle_id = s.cycle_id where c.name = 'Term 1 2027' and s.session_number = 2 and t.student_id = 'M-0042' and t.type = 'payment'`);
    ok(rp[0].n === 1, 'Riley recorded as paid $60 for session 2');
    ok(await page.isHidden('#selbar'), 'selection closes after recording');
    await ctx.close();
  }

  console.log('\nReadiness');
  {
    const { ctx, page } = await open('owner@ama.test');
    await tab(page, 'readiness');
    ok((await page.textContent('#view-readiness')).includes('Never marks anyone ready') || (await page.textContent('#view-readiness')).includes('never marks anyone ready'), 'readiness screen explains it is separate from attendance');
    ok((await page.$$('#rdList [data-rd]')).length >= 2, 'readiness lists the students in the active cycle');
    await page.click('#rdList [data-rd="M-0042"]'); await page.waitForSelector('#rdForm');
    await page.check('#rdForm [name=rdStatus][value=not_ready]');
    await page.click('#rdSave');
    ok((await toastText(page)).includes('Choose a reason'), 'flagging not ready requires a reason');
    await page.selectOption('#rdReason', 'technique'); await page.fill('#rdNotes', 'Poomsae timing'); await page.fill('#rdNext', 'Extra class');
    await page.click('#rdSave'); await settle(page);
    const rr = (await q(`select r.status, r.reason, r.notes, r.next_action, r.reviewed_by from prep_readiness r join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and r.student_id = 'M-0042'`))[0];
    ok(rr.status === 'not_ready' && rr.reason === 'technique' && rr.notes === 'Poomsae timing' && rr.next_action === 'Extra class' && rr.reviewed_by === 'owner@ama.test', 'not ready saved with reason, notes, next action and reviewer');
    ok((await page.textContent('#rdList')).includes('Technique requires improvement'), 'list shows the reason');
    await tab(page, 'dashboard');
    const d = await page.textContent('#view-dashboard');
    ok(d.includes('Not ready for grading') && d.includes('Not ready for grading: technique requires improvement'), 'dashboard counts readiness and lists the not-ready student in Needs attention');
    await page.click('#view-dashboard .item:has-text("Riley Chen")');
    await page.waitForSelector('#rdForm');
    ok((await page.textContent('#sheet')).includes('Riley Chen'), 'Needs attention opens the readiness record');
    await page.check('#rdForm [name=rdStatus][value=on_track]'); await page.click('#rdSave'); await settle(page);
    await tab(page, 'readiness');
    await page.click('#rdList [data-rd="M-0042"]'); await page.waitForSelector('#rdForm');
    ok((await page.textContent('#sheet')).includes('History'), 'readiness history is shown after changes');
    await page.click('#sheet [data-close]');
    await page.click('#rdSelect'); await page.click('#rdSelAll');
    await page.click('#rdSetBtn'); await page.check('#rdForm [name=rdStatus][value=ready]'); await page.click('#rdSave');
    const bt = await confirm(page); await settle(page);
    ok(/Set \d+ students to "Ready for grading"/.test(bt), 'bulk readiness asks first');
    ok((await q(`select count(*)::int n from prep_readiness r join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and r.status <> 'ready'`))[0].n === 0, 'everyone selected set to ready');
    ok((await q(`select r.notes from prep_readiness r join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and r.student_id = 'M-0042'`))[0].notes === 'Poomsae timing', 'bulk update keeps each student\'s own notes when left blank');
    await shot(page, 'readiness');
    await ctx.close();
  }

  console.log('\nPayments');
  {
    const { ctx, page } = await open('owner@ama.test');
    await tab(page, 'payments');
    ok((await page.textContent('#view-payments')).includes('Outstanding'), 'Payments screen opens from More with an outstanding total');
    await page.click('#view-payments [data-pf="all"]');
    await page.click('#payList .item:has-text("Riley Chen")');
    await page.waitForSelector('#sheet [data-act="payment"]');
    ok((await page.textContent('#sheet')).includes('Paid at session 2'), 'payment record lists its transactions');
    await page.click('#sheet [data-act="oneoff"]'); await page.fill('#ooAmt', '100'); await page.fill('#ooWhy', 'Sibling discount'); await page.click('#ooF button[type=submit]'); await settle(page);
    let rp = (await q(`select s.* from prep_payment_summary s join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and s.student_id = 'M-0042' and s.kind = 'sessions'`))[0];
    ok(Number(rp.amount_due) === 100 && rp.fee_override !== null, 'one-off fee set with a reason');
    await page.click('#sheet [data-act="payment"]'); await page.fill('#txRef', 'R-77'); await page.selectOption('#txMethod', 'bank_transfer'); await page.click('#txGo'); await settle(page);
    rp = (await q(`select s.* from prep_payment_summary s join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and s.student_id = 'M-0042' and s.kind = 'sessions'`))[0];
    ok(Number(rp.amount_paid) === 100 && rp.status === 'paid', 'recording the balance ($40) makes it fully paid');
    await page.click('#sheet [data-act="payment"]'); await page.fill('#txAmt', '5'); await page.fill('#txRef', 'r-77'); await page.click('#txGo');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('already been used'), null, { timeout: 5000 }).catch(() => {});
    ok((await toastText(page)).includes('already been used'), 'same receipt number twice is refused with a clear message');
    await page.click('#txCancel');
    await page.click('#sheet [data-act="refund"]'); await page.fill('#txAmt', '10'); await page.click('#txGo');
    ok(await page.isVisible('#txF'), 'a refund needs a note');
    await page.fill('#txNotes', 'Missed session refunded'); await page.click('#txGo'); await settle(page);
    rp = (await q(`select s.* from prep_payment_summary s join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and s.student_id = 'M-0042' and s.kind = 'sessions'`))[0];
    ok(Number(rp.amount_paid) === 90 && Number(rp.balance) === 10, 'refund reduces the amount paid');
    await page.click('#sheet [data-act="status"]'); await page.selectOption('#stSel', 'waived'); await page.fill('#stWhy', 'Committee approved'); await page.click('#stF button[type=submit]'); await settle(page);
    ok((await q(`select s.status from prep_payment_summary s join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and s.student_id = 'M-0042' and s.kind = 'sessions'`))[0].status === 'waived', 'fee marked waived with a reason');
    await shot(page, 'payment-record');
    await page.click('#sheet [data-close]');
    await page.click('#view-payments [data-kind="grading"]');
    ok((await page.textContent('#payList')).includes('Grading to Probationary Black Belt'), 'grading fees can be shown on their own');
    await shot(page, 'payments');
    await ctx.close();
  }

  console.log('\nGrading results and lists');
  {
    const { ctx, page } = await open('owner@ama.test');
    await tab(page, 'grading');
    await page.click('#view-grading [data-grf="nominated"]');
    ok((await page.textContent('#grListItems')).includes('Alex Smith') && (await page.textContent('#grListItems')).includes('Cho Dan Bo → Probationary Black Belt'), 'Put forward list shows each student and the belt they are going to');
    await page.click('#grListItems [data-gr="BB0001"]'); await page.waitForSelector('#sheet [data-res="passed"]');
    await page.click('#sheet [data-res="passed"]'); await settle(page);
    ok((await q(`select g.result from prep_grading g join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and g.student_id = 'BB0001'`))[0].result === 'passed', 'result recorded as passed');
    ok((await q(`select belt_rank from prep_students where student_id = 'BB0001'`))[0].belt_rank === 'Cho Dan Bo', 'belt is not changed by a result');
    ok(!(await page.$('#grPromote')), 'there is no belt-update button');
    await page.click('#sheet [data-close]');
    await page.click('#view-grading [data-grf="all"]');
    await page.click('#grSelect'); await page.click('#grSelAll');
    ok(!(await page.$('#grSelbar [data-gbulk="promote"]')), 'bulk actions do not include updating belts');
    ok(!(await page.$('#grSelbar [data-gbulk="eligible"]')), 'bulk actions have no separate Eligible step');
    await page.click('#grSelbar [data-gbulk="put"]');
    await page.waitForSelector('#gpBulk');
    const bt = await page.textContent('#gpBulk');
    ok(bt.includes('Alex Smith (already put forward)') && bt.includes('marked eligible and charged'), 'bulk Put forward skips anyone already put forward and explains it marks eligible');
    const before = (await q(`select count(*)::int n from prep_enrolments e join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and e.is_grading`))[0].n;
    if (await page.$('#gpbReason')) {
      await page.click('#gpbGo');
      ok((await toastText(page)).includes('Give a reason') || (await page.isVisible('#gpBulk')) === false, 'students who have not met requirements need a reason');
    }
    if (await page.$('#gpbReason')) await page.fill('#gpbReason', 'Approved by head instructor');
    if (await page.$('#gpBulk')) { await page.click('#gpbGo'); await settle(page); }
    const after = (await q(`select count(*)::int n from prep_enrolments e join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and e.is_grading`))[0].n;
    const elig = (await q(`select count(*)::int n from prep_grading g join prep_cycles c using (cycle_id) where c.name = 'Term 1 2027' and g.eligibility_decision = 'eligible'`))[0].n;
    ok(after > before && elig === after, 'bulk Put forward marks them eligible and puts them forward in one go');
    await shot(page, 'grading');

    await page.click('#grList'); await page.waitForSelector('#lbPreview');
    await page.selectOption('#lbTpl', 'preset:instructor'); await page.selectOption('#lbF_who', 'all');
    const head = await page.textContent('#lbPreview tr');
    ok(head.includes('Name') && head.includes('Grading to') && head.includes('Sign-off') && !head.includes('owing'), 'instructor list has grading-to, attendance and no fees');
    const body = await page.textContent('#lbPreview');
    ok(body.includes('Alex Smith') && body.includes('Probationary Black Belt'), 'list shows the next belt for each student');
    await page.selectOption('#lbTpl', 'preset:admin'); await page.selectOption('#lbF_who', 'all');
    ok((await page.textContent('#lbPreview tr')).includes('Grading fee owing'), 'admin list adds fee columns');
    await page.click('#sheet details summary');
    await page.click('#lbCols input[data-col="notes"]'); await page.waitForSelector('#lbPreview');
    ok((await page.textContent('#lbPreview tr')).includes('Notes'), 'columns can be added');
    const dl = page.waitForEvent('download'); await page.click('#lbCsv'); const file = await dl;
    ok(/grading-list-term-1-2027-.*\.csv$/.test(file.suggestedFilename()), 'CSV downloads with a clear file name');
    await page.fill('#lbName', 'My admin list'); await page.click('#lbSave'); await settle(page);
    const t = (await q(`select name, audience, columns from prep_report_templates where name = 'My admin list'`))[0];
    ok(t && t.audience === 'admin' && t.columns.includes('notes'), 'template saved (marked admin because it has fees)');
    await shot(page, 'grading-list');
    await ctx.close();
  }

  console.log('\nCertificates');
  {
    const { ctx, page } = await open('owner@ama.test');
    await tab(page, 'dashboard');
    ok((await page.textContent('#view-dashboard')).includes('Certificates'), 'dashboard shows a certificates summary once someone has passed');
    await tab(page, 'certificates');
    await page.waitForSelector('#ceItems [data-ce="BB0001"]');
    ok((await page.textContent('#ceItems')).includes('Awaiting approval'), 'a student who passed shows as awaiting approval');
    await page.click('#ceItems [data-ce="BB0001"]'); await page.waitForSelector('#ceForm');
    ok(await page.inputValue('#ceName') === 'Alex Smith' && await page.inputValue('#ceRank') === 'Probationary Black Belt' && await page.inputValue('#ceNo') === '501',
       'certificate details filled in: name, awarded rank (the belt graded to) and Dan number');
    await page.fill('#ceName', 'Alexander James Smith');
    await page.click('#ceNext'); await settle(page);
    let ce = (await q(`select * from prep_certificates where student_id = 'BB0001'`))[0];
    ok(ce && ce.status === 'details_check' && ce.certificate_name === 'Alexander James Smith' && ce.certificate_number === '501' && ce.certificate_type === 'Dan certificate',
       'saving moves it to the next step (details to be checked) with the exact name');
    await page.click('#view-certificates [data-cef="all"]');
    await page.click('#ceItems [data-ce="BB0001"]'); await page.waitForSelector('#ceForm');
    await page.selectOption('#ceStatus', 'issued'); await page.click('#ceSave'); await settle(page);
    ce = (await q(`select status, issue_date::text d from prep_certificates where student_id = 'BB0001'`))[0];
    ok(ce.status === 'issued' && ce.d, 'marked issued; issue date filled in automatically');
    await page.click('#ceList'); await page.waitForSelector('#lbPreview');
    await page.selectOption('#lbTpl', 'preset:issued');
    ok((await page.textContent('#lbPreview')).includes('Alexander James Smith') && (await page.textContent('#lbPreview tr')).includes('Certificate number'), 'certificate list "Issued" shows the certificate');
    await page.selectOption('#lbTpl', 'preset:production');
    ok(!(await page.textContent('#lbPreview')).includes('Alexander'), '"Ready for production" list is separate and does not include issued certificates');
    const dl = page.waitForEvent('download'); await page.click('#lbCsv'); const file = await dl;
    ok(/certificate-list-term-1-2027-.*\.csv$/.test(file.suggestedFilename()), 'certificate list downloads as CSV');
    await page.fill('#lbName', 'Production run'); await page.click('#lbSave'); await settle(page);
    ok((await q(`select report_type from prep_report_templates where name = 'Production run'`))[0]?.report_type === 'certificate', 'certificate list templates are saved separately from grading lists');
    await page.selectOption('#lbTpl', 'preset:printer');
    const pHead = await page.$$eval('#lbPreview tr:first-child th', th => th.map(x => x.textContent));
    ok(pHead.join('|') === 'Name|Belt|Date|Dan number', '"For the printing company" has name, belt, date and Dan number');
    const pRow = await page.$$eval('#lbPreview tr:nth-child(2) td', td => td.map(x => x.textContent));
    ok(pRow[0] === 'Alexander James Smith' && pRow[3] === '501' && /^\d{1,2} [A-Z][a-z]+ \d{4}$/.test(pRow[2]), 'printer list shows the certificate name, Dan number and the date written out');
    let pdl = page.waitForEvent('download'); await page.click('#lbCsv'); let pf = await pdl;
    let csv = readFileSync(await pf.path(), 'utf8').replace(/^\uFEFF/, '');
    ok(csv.split('\r\n')[0] === 'Name,Belt,Date,Dan number', 'printer CSV starts with the column headings (no title rows)');
    await page.click('#lbFmt summary');
    await page.fill('#lbH_rank', 'Belt applying for');
    await page.waitForFunction(() => document.querySelector('#lbPreview tr').textContent.includes('Belt applying for'));
    await page.selectOption('#lbDate', 'numeric');
    ok(/^\d{2}\/\d{2}\/\d{4}$/.test(await page.textContent('#lbPreview tr:nth-child(2) td:nth-child(3)')), 'date format can be changed (14/11/2026)');
    await page.fill('#lbName', 'Printer AMA'); await page.click('#lbSave'); await settle(page);
    const pt = (await q(`select filters from prep_report_templates where name = 'Printer AMA'`))[0];
    ok(pt && pt.filters.headings.rank === 'Belt applying for' && pt.filters.dateFmt === 'numeric' && pt.filters.plain === true, 'renamed headings, date format and no title rows are saved with the template');
    await page.selectOption('#lbTpl', 'preset:all');
    ok(!(await page.textContent('#lbPreview tr')).includes('Belt applying for'), 'other templates keep the normal headings');
    await page.selectOption('#lbTpl', { label: 'Printer AMA' });
    ok((await page.textContent('#lbPreview tr')).includes('Belt applying for') && /^\d{2}\/\d{2}\/\d{4}$/.test(await page.textContent('#lbPreview tr:nth-child(2) td:nth-child(3)')), 'choosing the saved template brings its headings and date format back');
    await page.click('#lbFmt summary'); await page.click('#lbPlain');
    pdl = page.waitForEvent('download'); await page.click('#lbCsv'); pf = await pdl;
    csv = readFileSync(await pf.path(), 'utf8').replace(/^\uFEFF/, '');
    ok(csv.startsWith('Certificate list') && csv.includes('Belt applying for'), 'title rows can be switched back on');
    await page.click('#sheet [data-close]');
    await page.click('#ceSelect'); await page.click('#ceSelAll'); await page.click('#ceSetBtn');
    await page.selectOption('#cbStatus', 'reprint_required'); await page.click('#cbGo'); await confirm(page); await settle(page);
    ok((await q(`select status from prep_certificates where student_id = 'BB0001'`))[0].status === 'reprint_required', 'several certificates can be set at once (reprint required)');
    await shot(page, 'certificates');
    await ctx.close();
  }

  console.log('\nID cards printed in the card software');
  {
    // Riley and Jordan are going for 1st Dan (Probationary Black Belt); Cho Dan Bo students get no ID card
    await q(`update prep_students set belt_rank = 'Probationary Black Belt' where student_id in ('M-0042', 'BB0002')`);
    // In AMA ID Cards: Riley's card is added (name written differently) and printed
    await q(`insert into people (name, dan, photo_path) values ('RILEY  chen', '1st Dan', 'photos/r.jpg')`);
    await q(`insert into people (name, dan) values ('J. Lee', '1st Dan'), ('Taylor Brown', '3rd Dan')`);
    const rid = (await q(`select id, student_id from people where name = 'RILEY  chen'`))[0];
    ok(rid.student_id === 'M-0042', 'card added in the card software links itself to the student by name');
    const job = (await q(`insert into print_jobs (people_ids, card_count, pdf_path) values (array['${rid.id}']::uuid[], 1, 'jobs/r.pdf') returning id`))[0].id;
    const { ctx, page } = await open('owner@ama.test');
    await tab(page, 'attendance'); await page.waitForSelector('.att button');
    ok((await page.textContent('#attList')).includes('Card in print queue'), 'session list shows the card waiting in the print queue');
    await q(`update print_jobs set status = 'printed', printed_at = now() where id = '${job}'`);
    await page.reload(); await page.waitForFunction(() => !document.querySelector('#app').hidden && !document.querySelector('#view-dashboard').textContent.includes('Loading'));
    await tab(page, 'attendance'); await page.waitForSelector('.att button');
    const row = await page.textContent('#attList li:has-text("Riley Chen")');
    ok(row.includes('ID card printed'), 'once printed in the card software, the session list shows "ID card printed"');
    await shot(page, 'attendance-card-printed');
    await tab(page, 'students');
    ok((await page.textContent('#studentList li:has-text("Riley Chen")')).includes('Card'), 'student list marks students whose card is printed');
    await page.selectOption('#studentCard', 'notprinted');
    const np = await page.textContent('#studentList');
    ok(np.includes('Jordan Lee') && !np.includes('Riley Chen') && !np.includes('Alex Smith') && !np.includes('Taylor Brown'), '"No ID card printed" filter: Jordan (no card yet) shown; Riley (printed), Alex (Cho Dan Bo) and Taylor (not going for a Dan) left out');
    await page.selectOption('#studentCard', 'printed');
    ok((await page.textContent('#studentList')).includes('Riley Chen') && !(await page.textContent('#studentList')).includes('Jordan Lee'), '"ID card printed" filter shows Riley only');
    await page.selectOption('#studentCard', '');
    await tab(page, 'attendance'); await page.waitForSelector('#attCard');
    await page.selectOption('#attCard', 'notprinted');
    const anp = await page.textContent('#attList');
    ok(!anp.includes('Riley Chen') && !anp.includes('Alex Smith') && anp.includes('No one matches'), 'attendance list has the same "No ID card printed" filter (Riley printed, Alex is Cho Dan Bo)');
    await page.selectOption('#attCard', 'printed');
    ok((await page.textContent('#attList')).includes('Riley Chen'), 'attendance list "ID card printed" filter shows Riley');
    await page.selectOption('#attCard', '');
    await tab(page, 'students');
    await page.click('#studentList .item:has-text("Alex Smith")'); await page.waitForSelector('#sheet #stEdit');
    const alexRec = await page.textContent('#sheet');
    ok(alexRec.includes('Dan number') && !alexRec.includes('ID card'), 'Cho Dan Bo student (going for Probationary) has a Dan number but no ID card');
    await page.click('#sheet [data-close]');
    await page.click('#studentList .item:has-text("Taylor Brown")'); await page.waitForSelector('#sheet #stEdit');
    ok(!(await page.textContent('#sheet')).includes('ID card') && !(await page.$('#sheet [data-cardlink]')), 'no ID card shown for a student not going for a Dan (3rd Dan Level 2), even with a matching card');
    await page.click('#sheet [data-close]');
    await page.click('#studentList .item:has-text("Jordan Lee")'); await page.waitForSelector('#sheet [data-cardlink]');
    ok((await page.textContent('#sheet')).includes('No card linked'), 'student record shows when no card is linked');
    await page.click('#sheet [data-cardlink]'); await page.waitForSelector('#clList');
    await page.fill('#clSearch', 'lee');
    await page.click('#clList [data-person]:visible');
    await page.waitForSelector('#sheet [data-cardlink]');
    ok((await q(`select student_id from people where name = 'J. Lee'`))[0].student_id === 'BB0002', 'a card with a different name can be linked by hand');
    ok((await page.textContent('#sheet')).includes('Card not printed yet'), 'student record shows the linked card status');
    await ctx.close();
  }

  console.log('\nReports and exports');
  {
    const { ctx, page } = await open('owner@ama.test');
    const readXlsx = async dl => XLSX.readFile(await dl.path());
    await tab(page, 'reports');
    const rep = await page.textContent('#view-reports');
    ok(['Student register', 'Attendance by session', 'Attendance history', 'Readiness', 'Payments', 'Follow-up list', 'ID cards', 'Grading list', 'Certificate list'].every(t => rep.includes(t)), 'Reports screen lists every report');
    await page.click('[data-report="register"]'); await page.waitForSelector('#lbPreview');
    ok((await page.textContent('#lbPreview')).includes('Alex Smith') && (await page.textContent('#lbPreview tr')).includes('ID card'), 'student register shows students with their ID card status');
    const taylorRow = await page.textContent('#lbPreview tr:has-text("Taylor Brown")');
    ok(!taylorRow.includes('card'), 'register shows no card status for students not going for a Dan');
    let dl = page.waitForEvent('download'); await page.click('#lbXlsx'); let f = await dl;
    let wb = await readXlsx(f), rowsX = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    ok(/student-register-.*\.xlsx$/.test(f.suggestedFilename()) && rowsX[0][0] === 'Student register' && rowsX.some(r => r.includes('Alex Smith')), 'Excel download contains the report with a title');
    await page.click('#sheet [data-close]');
    await page.click('[data-report="payments"]'); await page.waitForSelector('#lbPreview');
    ok((await page.textContent('#lbPreview tr')).includes('Balance'), 'payments report shows amounts');
    await page.selectOption('#lbTpl', 'preset:all');
    ok((await page.textContent('#lbPreview')).includes('Riley Chen'), 'payments report "All fees" lists fees');
    await page.click('#sheet [data-close]');
    await page.click('[data-report="cards"]'); await page.waitForSelector('#lbPreview');
    const cardsRep = await page.textContent('#lbPreview');
    ok(cardsRep.includes('Riley Chen') && !cardsRep.includes('Taylor Brown') && !cardsRep.includes('Brand New') && !cardsRep.includes('Alex Smith'), 'ID cards report lists only students going for 1st Dan or higher (not Cho Dan Bo)');
    await page.click('#sheet [data-close]');
    await page.click('[data-report="followup"]'); await page.waitForSelector('#lbPreview');
    ok((await page.textContent('#lbPreview tr')).includes('Issues'), 'follow-up list opens');
    await page.click('#sheet [data-close]');
    dl = page.waitForEvent('download'); await page.click('#exportAll'); f = await dl;
    wb = await readXlsx(f);
    ok(['Students', 'Cycles', 'Sessions', 'Attendance', 'Readiness', 'Grading', 'Certificates', 'Fees', 'Payment transactions'].every(n => wb.SheetNames.includes(n)), 'Export everything gives one workbook with a sheet per table');
    ok(XLSX.utils.sheet_to_json(wb.Sheets['Payment transactions']).length > 0, 'payment transactions are included for admins');
    await tab(page, 'attendance'); await page.waitForSelector('#attExport');
    await page.click('#attExport'); await page.waitForSelector('#lbPreview');
    const ah = await page.textContent('#lbPreview tr');
    ok(ah.includes('Session 1') && ah.includes('Sign-off') && ah.includes('Attendance %'), 'Export on the attendance screen gives attendance by session for that cycle');
    await page.click('#sheet [data-close]');
    await tab(page, 'students'); await page.click('#exportStudentsBtn'); await page.waitForSelector('#lbPreview');
    ok((await page.textContent('#sheet')).includes('Student register'), 'Export on the students screen opens the register');
    await shot(page, 'export');
    await ctx.close();
  }
  {
    const { ctx, page } = await open('view@ama.test');
    await tab(page, 'reports');
    const rep = await page.textContent('#view-reports');
    ok(!rep.includes('Session and grading fees') && !(await page.$('#exportAll')), 'viewers get no payments report and no Export everything');
    await page.click('[data-report="register"]'); await page.waitForSelector('#lbPreview');
    ok(await page.isVisible('#lbXlsx'), 'viewers can still export the register');
    await ctx.close();
  }

  console.log('\nSelect several students and delete');
  {
    const { ctx, page } = await open('owner@ama.test');
    await tab(page, 'students');
    await page.click('#importStudentsBtn');
    await page.fill('#impText', 'Name\tBelt\nOops One\tFirst Dan\nOops Two\tThird Dan\nOops Three\tFirst Dan');
    await page.waitForSelector('#impPreview table'); await page.click('#impGo'); await confirm(page); await settle(page);
    await page.click('#selectStudentsBtn');
    ok(await page.isVisible('#stuSelbar'), 'Select shows the selection bar');
    await page.fill('#studentSearch', 'oops');
    await page.click('#stuSelAll');
    ok((await page.textContent('#stuSelCount')) === '3 selected', '"Select all shown" selects the filtered students');
    await page.click('#stuSelbar [data-sbulk="enrol"]');
    await page.waitForSelector('#askDlg[open]');
    ok((await page.textContent('#askText')).includes('Add 3 students to Term 1 2027'), 'bulk "Add to cycle" asks first (only one open cycle, so no picker)');
    await page.click('#askYes'); await settle(page);
    ok((await q(`select count(*)::int n from prep_enrolments e join prep_students s using (student_id) join prep_cycles c using (cycle_id) where s.full_name like 'Oops%' and c.name = 'Term 1 2027'`))[0].n === 3, 'three students added to the cycle');
    await page.click('#selectStudentsBtn');
    await page.fill('#studentSearch', '');
    for (const n of ['Oops One', 'Oops Two', 'Alex Smith']) await page.click(`#studentList .item:has-text("${n}")`);
    ok((await page.textContent('#stuSelCount')) === '3 selected', 'tapping students selects them');
    await shot(page, 'students-selecting');
    await page.click('#stuSelbar [data-sbulk="delete"]');
    const delTxt = await confirm(page); await settle(page);
    ok(delTxt.includes('cannot be undone') && delTxt.includes('skipped'), 'delete warns it cannot be undone and that students with history are skipped');
    await page.waitForSelector('#sheet[open]');
    const kept = await page.textContent('#sheet');
    ok(kept.includes('2 deleted, 1 kept') && kept.includes('Alex Smith') && kept.includes('Has payments recorded'), 'students with history are kept and listed with the reason');
    const left = (await q(`select full_name from prep_students where full_name in ('Oops One','Oops Two','Oops Three','Alex Smith') order by 1`)).map(r => r.full_name);
    ok(left.join() === 'Alex Smith,Oops Three', 'the two mistaken imports are gone; Alex and Oops Three remain');
    ok(await page.isVisible('#delAnyway'), 'a Delete anyway button is offered for students with history');
    await page.click('#delAnyway');
    await page.waitForSelector('#askDlg[open]');
    const anyTxt = await page.textContent('#askText');
    ok(anyTxt.includes('Alex Smith') && anyTxt.includes('payments') && anyTxt.includes('cannot be undone'), 'Delete anyway asks again and warns payments go too');
    await page.click('#askNo'); await page.waitForSelector('#askDlg:not([open])', { state: 'attached' });
    ok((await q(`select count(*)::int n from prep_students where full_name = 'Alex Smith'`))[0].n === 1, 'cancelling Delete anyway keeps the student');
    await page.click('#sheet [data-close]');
    await page.click('#studentList .item:has-text("Oops Three")');
    await page.click('#stDelete'); await confirm(page); await settle(page);
    ok((await q(`select count(*)::int n from prep_students where full_name = 'Oops Three'`))[0].n === 0 && !(await page.isVisible('#sheet[open]')), 'Delete on a student record removes them and closes the record');
    await shot(page, 'students-select');
    await ctx.close();
  }

  console.log('\nOther roles');
  {
    const { ctx, page } = await open('att@ama.test');
    await tab(page, 'students');
    ok(await page.isHidden('#addStudentBtn'), 'attendance recorder cannot add students');
    await tab(page, 'attendance');
    await page.waitForSelector('.att button', { timeout: 5000 }).catch(() => {});
    ok((await page.$$('.att button')).length > 0, 'attendance recorder can take attendance');
    ok((await page.$$('.att .pay')).length > 0, 'attendance recorder sees the $ button for per-session students');
    await tab(page, 'more');
    ok(await page.isHidden('#setForm') || !(await page.$('#setForm')), 'attendance recorder cannot change settings');
    ok(!(await page.$('[data-goto="payments"]')), 'attendance recorder has no Payments screen');
    await tab(page, 'readiness');
    ok((await page.textContent('#view-readiness')).includes('can view readiness but not change it'), 'attendance recorder sees readiness read-only');
    await ctx.close();
  }
  {
    const { ctx, page } = await open('view@ama.test');
    await tab(page, 'attendance');
    ok((await page.$$('.att button')).length === 0 && (await page.textContent('#attBody')).includes('can view attendance but not change it'), 'viewer sees attendance read-only');
    await tab(page, 'cycles');
    ok(await page.isHidden('#newCycleBtn'), 'viewer cannot start a cycle');
    await ctx.close();
  }
} catch (e) {
  failed++; console.log('  FAIL  stopped: ' + e.message.split('\n').slice(0, 4).join(' / '));
}

ok(consoleErrors.length === 0, 'no errors in the browser console' + (consoleErrors.length ? ': ' + consoleErrors.slice(0, 3).join(' | ') : ''));
await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
