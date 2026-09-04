# Security notes

- Never commit the administrator password, a control code, or a session token.
- The public repository contains no student roster. Student data is loaded from the Google Sheet only after administrator sign-in.
- The administrator password and checker control code are converted into one-time challenge proofs in the browser. Their reusable values are not placed in API URLs.
- Control codes are eight characters, expire at the organizer-selected time, and can be rotated. Ending an event invalidates scanner access.
- The Apps Script web app should execute as the Sheet owner. Choose the narrowest audience that still lets assigned attendance checkers use it.
- If a phone used for scanning is lost, rotate the event code from the Control Dashboard.

To report a security problem, contact the PSU Balabac University Student Government through an official campus channel. Do not post student information in a public GitHub issue.
