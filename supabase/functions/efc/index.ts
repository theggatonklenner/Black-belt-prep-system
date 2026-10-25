// @ts-nocheck
// Black Belt Prep: receives EFC Aquila members and leads from Zapier and keeps a searchable copy of their
// names and family contact details (table efc_members, see prep-update-13.sql).
//
// Zapier: trigger "EFC Aquila: New Member" (or New Lead, Member Query), then action "Webhooks by Zapier: POST"
//   URL:           https://<project>.supabase.co/functions/v1/efc?key=<secret>   (add &kind=lead for leads)
//   Payload type:  json
//   Data:          leave empty (Zapier then sends every field from EFC)
// The secret is in the efc_hook table (Table Editor). "Verify JWT" is off for this function: the secret is the check.
//
// Also accepts a list ({ members: [...] } or [...]) for loading many at once.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-efc-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Field names EFC (or a person in Zapier) might use, compared without case, spaces or punctuation
const FIELDS = {
  id: ['memberid', 'id', 'studentid', 'leadid', 'contactid', 'personid', 'memberno', 'membernumber', 'membershipnumber'],
  first: ['firstname', 'givenname', 'forename', 'first', 'memberfirstname', 'studentfirstname', 'leadfirstname'],
  last: ['lastname', 'surname', 'familyname', 'last', 'memberlastname', 'studentlastname', 'memberssurname', 'leadlastname'],
  full: ['fullname', 'name', 'membername', 'studentname', 'displayname', 'leadname', 'memberfullname'],
  phone: ['mobile', 'mobilephone', 'mobilenumber', 'phone', 'phonenumber', 'cell', 'cellphone', 'membermobile', 'memberphone', 'homephone', 'contactnumber'],
  email: ['email', 'emailaddress', 'memberemail', 'studentemail', 'leademail'],
  guardian_name: ['guardianname', 'parentname', 'guardian', 'parent', 'parentguardian', 'parentguardianname', 'guardianfullname', 'emergencycontactname', 'emergencycontact', 'contactname'],
  guardian_first: ['guardianfirstname', 'parentfirstname'],
  guardian_last: ['guardianlastname', 'guardiansurname', 'parentlastname', 'parentsurname'],
  guardian_phone: ['guardianmobile', 'guardianphone', 'guardianmobilenumber', 'parentmobile', 'parentphone', 'parentguardianmobile', 'parentguardianphone', 'emergencycontactphone', 'emergencycontactmobile', 'emergencycontactnumber'],
  guardian_email: ['guardianemail', 'parentemail', 'parentguardianemail', 'guardianemailaddress', 'parentemailaddress'],
  dob: ['dateofbirth', 'dob', 'birthday', 'birthdate'],
  status: ['status', 'memberstatus', 'enrolmentstatus', 'membershipstatus', 'leadstatus'],
  location: ['location', 'locationname', 'school', 'club', 'site']
};
const norm = k => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

// {guardian: {mobile: 1}} -> {guardianmobile: 1}; keeps the first value seen for each name
export function flatten(o, pre = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const key = pre + norm(k);
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else if (v !== null && v !== undefined && String(v).trim() !== '' && !(key in out)) out[key] = Array.isArray(v) ? v.join(', ') : String(v).trim();
  }
  return out;
}

export function toRow(rec, kind = 'member') {
  const f = flatten(rec), pick = n => { for (const k of FIELDS[n]) if (f[k]) return f[k]; return null; };
  const first = pick('first'), last = pick('last');
  const full = pick('full') || [first, last].filter(Boolean).join(' ');
  if (!full) return null;
  const phone = pick('phone'), email = pick('email'), id = pick('id');
  const gName = pick('guardian_name') || [pick('guardian_first'), pick('guardian_last')].filter(Boolean).join(' ') || null;
  const k = String(f.kind || f.type || kind).toLowerCase().includes('lead') ? 'lead' : 'member';
  const key = id ? 'efc:' + id : 'n:' + full.toLowerCase().replace(/\s+/g, ' ') + '|' + ((phone || '').replace(/\D/g, '') || (email || '').toLowerCase());
  return {
    member_key: key, kind: k, full_name: full.replace(/\s+/g, ' '), first_name: first, last_name: last,
    phone, email: email && email.toLowerCase(), guardian_name: gName, guardian_phone: pick('guardian_phone'),
    guardian_email: (pick('guardian_email') || '').toLowerCase() || null, date_of_birth: pick('dob'),
    status: pick('status'), location: pick('location'), raw: rec, updated_at: new Date().toISOString()
  };
}

export async function handle(req, db) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    const url = new URL(req.url);
    const given = url.searchParams.get('key') || req.headers.get('x-efc-key') || '';
    const { data: hook } = await db.from('efc_hook').select('secret').eq('id', 1).maybeSingle();
    if (!hook || !given || given !== hook.secret) return json({ error: 'Wrong or missing key.' }, 401);

    const text = await req.text();
    let body;
    try { body = JSON.parse(text); } catch (e) { body = Object.fromEntries(new URLSearchParams(text)); }
    const list = Array.isArray(body) ? body : Array.isArray(body.members) ? body.members : [body];
    const kind = url.searchParams.get('kind') === 'lead' ? 'lead' : 'member';
    const rows = [], skipped = [];
    for (const rec of list.slice(0, 5000)) { const r = toRow(rec, kind); if (r) rows.push(r); else skipped.push(rec); }
    // The same person twice in one batch: keep the last
    const byKey = new Map(rows.map(r => [r.member_key, r]));
    if (byKey.size) {
      const { error } = await db.from('efc_members').upsert([...byKey.values()], { onConflict: 'member_key' });
      if (error) throw new Error(error.message);
    }
    return json({ saved: byKey.size, skipped: skipped.length, ...(skipped.length ? { note: 'Skipped records had no name', fields: Object.keys(flatten(skipped[0])) } : {}) });
  } catch (e) {
    console.error(e);
    return json({ error: String(e && e.message || e) }, 500);
  }
}

if (typeof Deno !== 'undefined') {
  const { createClient } = await import('npm:@supabase/supabase-js@2.45.4');
  const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  Deno.serve(req => handle(req, db));
}
