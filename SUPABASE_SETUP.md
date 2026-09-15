# Supabase migration setup

This repository is prepared for a staged move from Google Sheets to Supabase. The existing Apps Script scanner remains active until the Supabase schema and administrator account are verified.

## Public configuration

`assets/js/config.js` contains only browser-safe values:

- Project URL: `https://edfcehmttcwhhknywflq.supabase.co`
- Publishable key beginning with `sb_publishable_`
- Administrator email: entered only on the private administrator sign-in screen

Never place a Supabase secret key, legacy service-role key, database password, student password, or recovery token in GitHub.

## 1. Apply the database migration

1. Open the Supabase project dashboard.
2. Open **SQL Editor** and create a new query.
3. Paste the complete contents of `supabase/migrations/001_attendance_portal.sql`.
4. Run the query once and confirm that it commits successfully.

The migration creates the student profiles, events, hashed control codes, scanner sessions, paired Time In/Time Out records, correction audit log, reports, Row-Level Security policies and two private Storage buckets.

## 2. Create the first USG administrator

1. Open **Authentication → Users → Add user**.
2. Use the approved private USG administrator email, create a strong temporary administrator password and mark the email confirmed.
3. Copy the new Auth user UUID.
4. Run this statement in SQL Editor after replacing the placeholder:

```sql
insert into public.profiles (
  id, role, first_name, last_name, account_status, must_change_password
) values (
  'ADMIN_AUTH_USER_UUID', 'admin', 'USG', 'Administrator', 'active', false
);
```

Use multi-factor authentication on the Supabase owner account and do not share the administrator password through GitHub or chat.

## 3. Deploy the account Edge Functions

Deploy both folders under `supabase/functions`:

- `admin-students` creates, resets, deactivates and reactivates student Auth accounts.
- `student-password` replaces the first-login temporary password.

Set these function secrets:

```text
APP_ORIGIN=https://princecabaya.github.io
STUDENT_EMAIL_DOMAIN=students.psubalabac.invalid
```

Supabase automatically provides its project URL and server-side credentials to hosted Edge Functions. Do not expose those server-side credentials in the website.

## 4. Verify Stage 1

1. Sign in to `students.html` as the USG administrator.
2. Enroll one test student.
3. Copy the displayed one-time username and temporary password.
4. Open `portal.html` in a private window.
5. Sign in, change the password, complete the test profile and upload a test image.
6. Confirm that the student can see only their own profile, ID and attendance report.
7. Confirm that the photo and generated ID copies are not publicly accessible without an authenticated signed URL.

## 5. Stage 2 cutover

After Stage 1 passes, update the existing scanner, Control, ID Generator and Reports pages to call the included Supabase tables and RPC functions. Import the roster and historical attendance, run an event-day pilot, then retire Apps Script from the live scan path. Keep the old Google Sheet read-only during the verification period.

## Password policy

- Username: student number.
- Initial credential: randomly generated one-time temporary password.
- First login: forced replacement with at least 12 characters, uppercase, lowercase, number and symbol.
- Forgotten password: USG verifies identity and issues a new temporary password.
- Existing passwords are never displayed or exported.

## Privacy approval

`privacy.html` is a technical draft, not a final institutional notice. Before production enrollment, PSU should approve the processing purpose, responsible office, contact details, retention period, printed fields and procedures for access, correction and deletion.
