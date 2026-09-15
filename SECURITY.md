# Security notes

- Never commit a Supabase secret key, legacy service-role key, database password, student password, recovery token, or private student export. Only the browser-safe Project URL and publishable key belong in the GitHub Pages configuration.
- Supabase student passwords are never stored or displayed by this application. Enrollment and password resets return a randomly generated temporary password once; a forgotten password is reset, not retrieved.
- Student numbers are usernames but are not passwords. Students must replace the temporary password during first login.
- Bulk rosters are parsed in the administrator's browser and are not committed to GitHub. The temporary-credentials workbook exists only on the administrator's device and must be stored securely, distributed individually, and deleted when no longer operationally required.
- Student photos and saved ID copies use private Storage buckets protected by Row-Level Security. The public repository contains no roster, photos or attendance exports.
- Students can select only their own profile and attendance rows. USG administrator access is checked from the protected `profiles` table rather than editable browser metadata.
- Attendance uses unique request identifiers and a database constraint allowing only one open Time In per student and event. Corrections are audited instead of silently deleting history.
- The migration keeps the Google-backed scanner operational until Supabase policies and account workflows pass the test checklist in `SUPABASE_SETUP.md`.

## Legacy Google backend

- Never commit the administrator password, a control code, or a session token.
- The public repository contains no student roster. Student data is loaded from the Google Sheet only after administrator sign-in.
- The administrator password and checker control code are converted into one-time challenge proofs in the browser. Their reusable values are not placed in API URLs.
- Control codes are eight characters, expire at the organizer-selected time, and can be rotated. Ending an event invalidates scanner access.
- The Apps Script web app should execute as the Sheet owner. Choose the narrowest audience that still lets assigned attendance checkers use it.
- If a phone used for scanning is lost, rotate the event code from the Control Dashboard.

To report a security problem, contact the PSU Balabac University Student Government through an official campus channel. Do not post student information in a public GitHub issue.
