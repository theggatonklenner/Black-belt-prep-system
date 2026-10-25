// Checks the "efc" Supabase function (EFC Aquila members from Zapier) with a pretend database.
// Run: node tests/efc-function.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = join(mkdtempSync(join(tmpdir(), 'efc-')), 'efc.mjs');
writeFileSync(tmp, readFileSync(join(here, '../supabase/functions/efc/index.ts'), 'utf8'));
const { handle, toRow } = await import(pathToFileURL(tmp).href);

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  pass  ' + m); } else { failed++; console.log('  FAIL  ' + m); } };

const tables = { efc_hook: [{ id: 1, secret: 's3cret' }], efc_members: [] };
const db = {
  from(t) {
    const f = []; let single = false;
    const q = {
      select() { return q; }, eq(c, v) { f.push(r => r[c] === v); return q; }, maybeSingle() { single = true; return q; },
      async upsert(rows) { for (const r of rows) { const i = tables[t].findIndex(x => x.member_key === r.member_key); if (i >= 0) tables[t][i] = r; else tables[t].push(r); } return { error: null }; },
      then(res) { const d = tables[t].filter(r => f.every(x => x(r))); return Promise.resolve({ data: single ? d[0] || null : d, error: null }).then(res); }
    };
    return q;
  }
};
const post = (body, qs = '?key=s3cret') => handle(new Request('https://x.test/functions/v1/efc' + qs, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), db).then(async r => ({ status: r.status, ...(await r.json()) }));

console.log('Reading EFC fields');
let r = toRow({ 'First Name': 'Kian', 'Last Name': 'Lee', Mobile: '0412 345 678', 'Email Address': 'KIAN@x.test', Guardian: { 'First Name': 'Mei', 'Last Name': 'Lee', Mobile: '0400 111 222', Email: 'Mei@x.test' }, 'Member ID': 77 });
ok(r.full_name === 'Kian Lee' && r.phone === '0412 345 678' && r.email === 'kian@x.test' && r.member_key === 'efc:77', 'names, mobile, email and member ID are picked up whatever the field names look like');
ok(r.guardian_name === 'Mei Lee' && r.guardian_phone === '0400 111 222' && r.guardian_email === 'mei@x.test', 'parent details are picked up, including nested ones');
r = toRow({ name: 'Ava Brown', phone: '0411 000 000' }, 'lead');
ok(r.kind === 'lead' && r.member_key === 'n:ava brown|0411000000', 'with no member ID it is matched on name and phone');
ok(toRow({ phone: '1' }) === null, 'a record with no name is skipped');

console.log('\nWebhook');
ok((await post({ name: 'X' }, '')).status === 401 && (await post({ name: 'X' }, '?key=nope')).status === 401, 'the secret key is required');
r = await post({ 'First Name': 'Kian', 'Last Name': 'Lee', 'Member ID': 77, Mobile: '0412 345 678' });
ok(r.saved === 1 && tables.efc_members.length === 1, 'a member from Zapier is saved');
r = await post({ 'First Name': 'Kian', 'Last Name': 'Lee', 'Member ID': 77, Mobile: '0499 999 999' });
ok(tables.efc_members.length === 1 && tables.efc_members[0].phone === '0499 999 999', 'sending the same member again updates them');
r = await post({ members: [{ name: 'Ava Brown', mobile: '0411' }, { name: 'Noah Smith' }, { phone: '1', foo: 'bar' }] }, '?key=s3cret&kind=lead');
ok(r.saved === 2 && r.skipped === 1 && r.fields.includes('foo') && tables.efc_members.filter(m => m.kind === 'lead').length === 2, 'a list loads many at once and reports records it could not read');
r = await post('First+Name=Zoe&Last+Name=Tan');
ok(r.saved === 1 && tables.efc_members.some(m => m.full_name === 'Zoe Tan'), 'form-encoded posts work too');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
