# Stage 3: Student register, cycles and attendance

The app is a single web page (`docs/index.html`) published with GitHub Pages, in the same style as AMA ID Cards. It installs on a phone like an app (Share > Add to Home Screen) and uses the same logins.

## Publishing

1. On GitHub, open this repository's **Settings > Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/docs**, then **Save**.
3. After a minute the app is at `https://theggatonklenner.github.io/Black-belt-prep-system/`.

GitHub Pages on a free account needs the repository to be public. That is safe here: the code holds no member data or passwords, and the database only answers signed-in users with a prep role.

## Giving people access

People sign in with their AMA ID Cards login. Card software admins are already prep admins. To add someone else: **More > Users > Add user**, enter their email and tick their roles. If they don't have a login yet, create one in Supabase first (Authentication > Users).

## What's in this stage

**Dashboard**
- Active cycle with session dates and a "Take attendance" shortcut for the next session
- Active students, students in the cycle, attended all sessions, with absences, attendance not recorded for past sessions, below the attendance requirement
- Needs attention list (unrecorded past sessions and absences), each opening the student record

**Students**
- Search by name or Student ID; filter by club and active or inactive; test records hidden unless asked for
- Add and edit; Student IDs are created automatically (BB0001, BB0002 ...) and never change
- Warning before adding a name that already exists, and a banner listing possible duplicates
- Deactivate and reactivate without losing history
- Import from CSV or pasted spreadsheet rows, with a preview that skips existing students, repeats and unreadable dates
- Student record: details, current cycle (attendance by session plus readiness, payment, grading, certificate and ID card status) and earlier cycles

**Preparation cycles**
- Start New Preparation Cycle: name, dates, four session dates filled in weekly, fee, payment due date, all active students or chosen students, a review step, and the option to make it active (the previous active cycle is marked Completed; its records are kept)
- A cycle name can't be used twice, so pressing the button again can't create duplicates
- Edit dates, session dates, fee and notes; add students mid-cycle; remove a student added by mistake (blocked once a payment is recorded)
- Make active, mark completed, archive and restore

**Attendance**
- Choose a cycle and session; one tap for Present, Absent or Excused; tap another to correct it
- Search and filter by club or status
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

`tests/app.test.mjs` runs the app in a headless browser at phone size against a local stand-in for Supabase that uses the real database rules. It covers 58 checks, including sign-in, permissions for three roles, student add/edit/duplicate/import, starting cycles, individual, bulk and imported attendance, history being preserved, and no browser errors.

```
cd tests && npm install
CARD_REPO=/path/to/ama-id-cards node database.test.mjs
CARD_REPO=/path/to/ama-id-cards node app.test.mjs
```
