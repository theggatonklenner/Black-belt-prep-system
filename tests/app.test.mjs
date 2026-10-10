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
await db.exec(`insert into prep_roles (email, role) values ('att@ama.test','attendance'), ('view@ama.test','viewer');
  update prep_settings set default_session_fee = 120;`);

const users = Object.fromEntries(['owner@ama.test', 'att@ama.test', 'view@ama.test', 'nobody@ama.test']
  .map((e, i) => [e, { id: `00000000-0000-0000-0000-00000000000${i + 1}`, password: 'pw' }]));
const server = await startServer({ db, appDir: join(here, '../docs'), users, config: '' });
const BASE = `http://localhost:${server.address().port}`;
const configJs = `window.PREP_CONFIG = { SUPABASE_URL: '${BASE}', SUPABASE_ANON_KEY: 'test-anon-key' };`;
const q = server.q;

// ---------- Browser ----------
const browser = await chromium.launch();
let passed = 0, failed = 0, shotN = 0;
const ok = (c, name) => { if (c) { passed++; console.log('  pass  ' + name); } else { failed++; console.log('  FAIL  ' + name); } };
const consoleErrors = [];

async function open(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-AU', timezoneId: 'Australia/Sydney' });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: read(join(here, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js')) }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs }));
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/websocket|realtime|ERR_CONNECTION|Failed to load resource/i.test(m.text())) consoleErrors.push(`${email}: ${m.text()}`); });
  page.on('pageerror', e => consoleErrors.push(`${email}: ${e.message}`));
  await page.goto(BASE + '/');
  if (email) {
    await page.fill('#loginEmail', email); await page.fill('#loginPassword', 'pw');
    await page.click('#loginBtn');
    await page.waitForFunction(() => !document.querySelector('#app').hidden || !document.querySelector('#noAccessView').hidden, null, { timeout: 8000 });
  }
  return { ctx, page };
}
const shot = async (page, name) => page.screenshot({ path: join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`), fullPage: false });
const confirm = async page => { await page.waitForSelector('#askDlg[open]'); const t = await page.textContent('#askText'); await page.click('#askYes'); await page.waitForSelector('#askDlg:not([open])', { state: 'attached' }); return t; };
const tab = (page, v) => page.click(`.tab[data-view="${v}"]`);
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
  await page.fill('#fName', 'Alex Smith'); await page.fill('#fClub', 'Marrickville'); await page.fill('#fRank', '1st Poom'); await page.fill('#fDob', '2010-03-01');
  await shot(page, 'add-student');
  await page.click('#fSave');
  ok((await toastText(page)).includes('as BB0001'), 'student added and given Student ID BB0001');
  await page.click('#sheet [data-close]');
  await page.click('#addStudentBtn');
  await page.fill('#fName', 'ALEX  smith'); await page.click('#fSave');
  const dupText = await page.textContent('#askText', { timeout: 3000 }).catch(() => '');
  ok(dupText.includes('Alex Smith (BB0001'), 'adding a matching name warns about a possible duplicate');
  await page.click('#askNo'); await page.click('#sheet [data-close]');
  ok((await q(`select count(*)::int n from prep_students`))[0].n === 1, 'cancelled duplicate was not saved');

  await page.click('#importStudentsBtn');
  await page.fill('#impText', [
    'First name,Last name,Club,Belt,DOB,Student ID',
    'Jordan,Lee,Marrickville,1st Dan,12/07/2008,',
    'Taylor,Brown,Newtown,1st Poom,20/01/2011,',
    'Sam,Nguyen,Newtown,Red tip,31/02/2012,',
    'alex,smith,Newtown,,,',
    'Riley,Chen,Marrickville,1st Poom,5 Mar 2010,M-0042',
    'Jordan,Lee,Marrickville,,,'
  ].join('\n'));
  await page.waitForSelector('#impPreview table');
  const prev = await page.textContent('#impPreview');
  ok(prev.includes('3 to add') && prev.includes('3 skipped'), 'import preview: 3 to add, 3 skipped');
  ok(prev.includes('not understood') && prev.includes('Already in the register') && prev.includes('Repeated in this list'), 'preview explains each skipped row (bad date, existing, repeated)');
  await shot(page, 'import-preview');
  await page.click('#impGo'); await confirm(page); await settle(page);
  const imported = await q(`select student_id, full_name, dob::text from prep_students order by student_id`);
  ok(imported.length === 4 && imported.some(s => s.student_id === 'M-0042' && s.dob === '2010-03-05'), 'import kept the supplied Student ID and read "5 Mar 2010"');
  ok(imported.some(s => s.full_name === 'Jordan Lee' && s.dob === '2008-07-12'), 'import read Australian date 12/07/2008 correctly');
  await page.click('#addStudentBtn'); await page.fill('#fName', 'Test Student'); await page.check('#fTest'); await page.click('#fSave'); await settle(page); await page.click('#sheet [data-close]');
  ok((await page.textContent('#studentList')).includes('Test Student') === false, 'test records hidden from the list by default');
  await page.check('#studentShowTest');
  ok((await page.textContent('#studentList')).includes('Test Student'), '"Show test records" reveals them');
  await page.uncheck('#studentShowTest');
  await page.fill('#studentSearch', 'lee');
  ok((await page.$$('#studentList [data-student]')).length === 1, 'search filters the list');
  await page.fill('#studentSearch', '');
  await page.selectOption('#studentClub', 'Newtown');
  ok((await page.$$('#studentList [data-student]')).length === 1, 'club filter works');
  await page.selectOption('#studentClub', '');
  await shot(page, 'students');

  await page.click('[data-student="BB0002"]');
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
  await page.fill('#ncStart', '2026-10-05'); await page.dispatchEvent('#ncStart', 'change');
  ok(await page.inputValue('#ncS4') === '2026-10-26' && await page.inputValue('#ncEnd') === '2026-10-26', 'session dates filled in weekly from the start date');
  ok(await page.inputValue('#ncFee') === '120.00', 'fee defaults from settings');
  await shot(page, 'new-cycle');
  await page.click('#ncGo');
  const review = await confirm(page);
  ok(review.includes('4 students enrolled') && review.includes('becomes the active cycle'), 'review step summarises the cycle before creating it');
  await page.waitForSelector('#cyclePill:not([hidden])');
  ok((await page.textContent('#cyclePillText')) === 'Term 4 2026', 'new cycle is active and shown in the header');
  const c1 = (await q(`select cycle_id, status from prep_cycles where name = 'Term 4 2026'`))[0];
  ok(c1.status === 'active', 'cycle saved as active');
  ok((await q(`select count(*)::int n from prep_attendance where cycle_id = $1 and status = 'not_recorded'`, [c1.cycle_id]))[0].n === 16, 'fresh attendance created for 4 students x 4 sessions');
  await page.click('#newCycleBtn'); await page.fill('#ncName', 'term 4 2026'); await page.fill('#ncStart', '2026-10-05'); await page.dispatchEvent('#ncStart', 'change');
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

  await page.click('#attBody [data-session="2"]');
  await page.selectOption('#attClub', 'Marrickville');
  await page.click('#attAllPresent'); const allTxt = await confirm(page); await settle(page);
  ok(/Mark 3 students present/.test(allTxt), '"Mark shown as present" only covers the filtered students (3 at Marrickville)');
  const s2 = await q(`select a.student_id, a.status from prep_attendance a join prep_sessions s using (session_id) where s.cycle_id = $1 and s.session_number = 2`, [c1.cycle_id]);
  ok(s2.filter(r => r.status === 'present').length === 3 && s2.find(r => r.student_id === 'BB0003').status === 'not_recorded', 'student at the other club left unrecorded');
  await page.selectOption('#attClub', '');
  await shot(page, 'attendance');

  await page.click('#attImport');
  await page.fill('#impText', 'Student ID,Name,Session,Status\nBB0003,,2,P\n,Jordan Lee,3,absent\n,Nobody Here,3,P\nBB0001,,7,P\nBB0001,,3,maybe\nBB0001,,2,present');
  await page.waitForSelector('#impPreview table');
  const ip = await page.textContent('#impPreview');
  ok(ip.includes('2 to record') && ip.includes('Student not found') && ip.includes('No session 7') && ip.includes('not understood') && ip.includes('Already recorded'), 'attendance import preview flags unknown students, bad sessions, bad statuses and repeats');
  await shot(page, 'attendance-import');
  await page.click('#impGo'); await confirm(page); await settle(page);
  ok((await q(`select count(*)::int n from prep_attendance a join prep_sessions s using (session_id) where s.cycle_id = $1 and ((s.session_number = 2 and a.student_id = 'BB0003' and a.status = 'present') or (s.session_number = 3 and a.student_id = 'BB0002' and a.status = 'absent'))`, [c1.cycle_id]))[0].n === 2, 'imported attendance saved');

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
  await shot(page, 'dashboard');

  // ------------------------------------------------------------------
  console.log('\nNew cycle keeps history');
  const before = await q(`select attendance_id, status from prep_attendance where cycle_id = $1 order by 1`, [c1.cycle_id]);
  await tab(page, 'cycles');
  await page.click('#newCycleBtn');
  await page.fill('#ncName', 'Term 1 2027'); await page.fill('#ncStart', '2027-02-08'); await page.dispatchEvent('#ncStart', 'change');
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
  await tab(page, 'students'); await page.click('[data-student="BB0001"]');
  const hist = await page.textContent('#sheet');
  ok(hist.includes('Current cycle') && hist.includes('History') && hist.includes('Term 4 2026'), 'student record shows current cycle and history');
  await shot(page, 'student-detail');
  await page.click('#sheet [data-close]');

  // ------------------------------------------------------------------
  console.log('\nSettings and users');
  await tab(page, 'more');
  await page.waitForSelector('#userList ul');
  await page.fill('#setReq', '3'); await page.click('#setForm button[type=submit]'); await settle(page);
  ok((await q(`select sessions_required from prep_settings`))[0].sessions_required === 3, 'settings saved');
  await page.click('#addUserBtn'); await page.fill('#uEmail', 'Coach@AMA.test'); await page.check('#uForm input[value="instructor"]'); await page.click('#uForm button[type=submit]'); await settle(page);
  ok((await q(`select role from prep_roles where email = 'coach@ama.test'`)).map(r => r.role).join() === 'instructor', 'admin adds a user with a role');
  await page.waitForSelector('#auditList table');
  ok((await page.textContent('#auditList')).includes('Attendance:'), 'recent changes list shows attendance changes');
  await shot(page, 'more');
  await ctx.close();

  // ------------------------------------------------------------------
  console.log('\nOther roles');
  {
    const { ctx, page } = await open('att@ama.test');
    await tab(page, 'students');
    ok(await page.isHidden('#addStudentBtn'), 'attendance recorder cannot add students');
    await tab(page, 'attendance');
    ok((await page.$$('.att button')).length > 0, 'attendance recorder can take attendance');
    await tab(page, 'more');
    ok(await page.isHidden('#setForm') || !(await page.$('#setForm')), 'attendance recorder cannot change settings');
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
  failed++; console.log('  FAIL  stopped: ' + e.message.split('\n')[0]);
}

ok(consoleErrors.length === 0, 'no errors in the browser console' + (consoleErrors.length ? ': ' + consoleErrors.slice(0, 3).join(' | ') : ''));
await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
