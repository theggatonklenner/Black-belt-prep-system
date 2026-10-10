# Stage 3: Student register, cycles and attendance

The app is a single web page (`docs/index.html`) published with GitHub Pages, in the same style as AMA ID Cards. It installs on a phone like an app (Share > Add to Home Screen) and uses the same logins.

## Publishing

1. On GitHub, open this repository's **Settings > Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/docs**, then **Save**.
3. After a minute the app is at `https://theggatonklenner.github.io/Black-belt-prep-system/`.

GitHub Pages on a free account needs the repository to be public. That is safe here: the code holds no member data or passwords, and the database only answers signed-in users with a prep role.

## Database update 01

Run `supabase/prep-update-01.sql` once in Supabase > SQL Editor (after `prep-setup.sql`). It adds:
- **Dan numbers.** Students going for Probationary Black Belt or a Dan get the next number when they join a cycle. Set the next number under More > Settings. Numbers go up by one per person in name order, are never reused, and a student repeating the same grading keeps theirs. An admin can correct a number from the student record (with a reason).
  Cho Dan Bo > Probationary Black Belt, Probationary Black Belt > 1st Dan Black Belt, 1st Dan Level 1 > 2nd Dan, 2nd Dan Level 2 > 3rd Dan, 3rd Dan Level 3 > 4th Dan, 4th Dan Level 4 > 5th Dan.
- **Sign-off.** The last session of every cycle is the sign-off. A student only meets the attendance requirement if they are marked Present at it; excused does not count.
- **Grading date** for each cycle.
- **Fees: $200 upfront or $60 per session.** Both are set per cycle (defaults in Settings). Students start on upfront; anyone with the Payments role can switch a student on their record. Per-session students owe the fee for each session they are marked Present at, so the amount updates as attendance is recorded or corrected. A one-off fee needs a reason.

The app keeps working before the update is run; Dan numbers and grading dates appear once it is.

## Database update 02

Run `supabase/prep-update-02.sql` once (after update 01). Dan numbers now run separately for each rank being graded for: Probationary Black Belt, 1st Dan, 2nd Dan, 3rd Dan, 4th Dan and 5th Dan each have their own next number under More > Settings. Numbers already handed out are kept, and each rank starts from the single next number set before (change them in Settings). The same number can be used once per rank.

## Giving people access

People sign in with their AMA ID Cards login. Card software admins are already prep admins. To add someone else: **More > Users > Add user**, enter their email and tick their roles. If they don't have a login yet, create one in Supabase first (Authentication > Users).

## What's in this stage

**Dashboard**
- Active cycle with session dates, sign-off and grading date, and a "Take attendance" shortcut for the next session
- Active students, students in the cycle, attended all sessions, with absences, attendance not recorded for past sessions, below the attendance requirement
- Missed the sign-off count
- Needs attention list (missed sign-off, unrecorded past sessions and absences), each opening the student record

**Students**
- Search by name or Student ID; filter by belt rank and active or inactive; test records hidden unless asked for
- Students need only a name and belt rank (no birth date, email or phone)
- Add and edit; Student IDs are created automatically (BB0001, BB0002 ...) and never change
- Belt rank is chosen from a list in grading order: Cho Dan Bo, Probationary Black Belt, 1st Dan Black Belt, 1st Dan Level 1, 2nd Dan, 2nd Dan Levels 1 to 2, 3rd Dan, 3rd Dan Levels 1 to 3, 4th Dan, 4th Dan Levels 1 to 4, 5th Dan. Imports match "lvl", "level" and capitals to the list
- Warning before adding a name that already exists, and a banner listing possible duplicates
- Deactivate and reactivate without losing history
- Import from CSV or pasted spreadsheet rows, with a preview that skips existing students, repeats and unknown belts; other columns are ignored
- Student record: details, current cycle (attendance by session plus readiness, payment, grading, certificate and ID card status) and earlier cycles

**Preparation cycles**
- Start New Preparation Cycle: name, four session dates (session 1 sets the rest every two weeks; session 4 is the sign-off), grading date (two weeks after the sign-off), fee, payment due date, all active students or chosen students, a review step, and the option to make it active (the previous active cycle is marked Completed; its records are kept)
- A cycle name can't be used twice, so pressing the button again can't create duplicates
- Edit session dates, grading date, fee and notes (cycles have no separate start or end date); add students mid-cycle; remove a student added by mistake (blocked once a payment is recorded)
- Make active, mark completed, archive and restore

**Attendance**
- Choose a cycle and session; one tap for Present, Absent or Excused; tap another to correct it
- Search and filter by belt rank or status
- Select several, then mark Present, Excused, Absent or Clear, always with a confirmation; "Mark shown as present" for the filtered list
- Nobody who isn't selected is ever marked absent
- Import from CSV or pasted rows (Student ID or name, status, optional session), with a preview of what will change and what is skipped
- Summary grid for the whole cycle with attended count, percentage and whether the requirement is met

**More**
- Settings: sessions required, whether excused counts, fees due on joining, default fee, allowing more than one active cycle
- Users and roles
- Recent changes from the audit log

Changes made on one device appear on others automatically.

## Tests

`tests/app.test.mjs` runs the app in a headless browser at phone size against a local stand-in for Supabase that uses the real database rules. It covers 76 checks, including sign-in, permissions for three roles, student add/edit/duplicate/import, starting cycles, individual, bulk and imported attendance, history being preserved, and no browser errors.

```
cd tests && npm install
CARD_REPO=/path/to/ama-id-cards node database.test.mjs
CARD_REPO=/path/to/ama-id-cards node app.test.mjs
```
