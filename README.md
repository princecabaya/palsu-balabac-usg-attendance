# PSU Balabac USG QR Attendance

A mobile-first QR attendance checker for Palawan State University – Balabac Campus and the University Student Government. The public site runs on GitHub Pages; a Google Apps Script web app securely writes attendance to the supplied **USG Attendance file** Google Sheet.

## Included

- Live rear-camera QR scanner plus saved-image and manual student-number fallbacks
- Navigation-free `scanner.html` for authorized student representatives
- Organizer-issued eight-character control codes with expiry, rotation, and event ending
- Separate organizer Control Dashboard
- Protected QR ID Generator that reads the existing 400-student roster
- Printable portrait IDs with PSU and USG logos, square 2×2 photo space, name, student number, and program
- BEEd, BSE, and BSA program support
- Automatic first time in, first time out, second time in, and second time out
- Duplicate-scan protection for 30 seconds
- Live summary totals by program in the existing Attendance Summary sheet
- Per-student event history with printable/PDF and CSV time-in/time-out reports after each successful scan

## Sheet compatibility

The server follows the supplied workbook:

- `Students Name and QR Code`: headers on row 10 and student records beginning on row 12
- `Attendance Summary`: event headers on row 8 and events beginning on row 9
- `Event 1`, `Event 2`, and later event tabs: columns A–J with two time-in/time-out pairs

The first new event safely reuses an empty `Event 1` or `Event 2`. It never reuses an event tab that already contains attendance times. Event sheets are expanded automatically to fit all 400 roster entries.

## 1. Connect the Google Sheet

1. Open the Google Sheet version of **USG Attendance file**.
2. Choose **Extensions → Apps Script**.
3. Replace the editor contents with [`google-apps-script/Code.gs`](google-apps-script/Code.gs), then save.
   - Optional: enable **Show “appsscript.json” manifest file in editor** in Project Settings and copy [`google-apps-script/appsscript.json`](google-apps-script/appsscript.json) to set the project timezone to Asia/Manila.
4. Reload the Google Sheet.
5. Choose **USG Attendance → Initialize / Change Admin Password** and create a password with at least 10 characters.
6. Return to Apps Script and choose **Deploy → New deployment → Web app**.
7. Set **Execute as** to **Me**. For checkers outside your Google Workspace, set access to **Anyone**; otherwise use your domain audience.
8. Authorize the deployment and copy its URL ending in `/exec`.

Do not paste the administrator password or an event control code into source files.

## 2. Set the permanent server URL

Open [`assets/js/config.js`](assets/js/config.js) and paste the `/exec` URL:

```js
apiUrl: "https://script.google.com/macros/s/DEPLOYMENT_ID/exec",
```

You may also paste the URL into the Control Dashboard for device-only setup. The dashboard copies the navigation-free `scanner.html` link. The control code is never included in that link and is cleared from the checker page after sign-in.

When updating an existing Apps Script installation, replace `Code.gs`, save, then open **Deploy → Manage deployments → Edit → New version → Deploy**. Updating the existing deployment keeps the configured `/exec` URL.

## 3. Publish with GitHub Pages

The included workflow deploys every push to `main`.

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions**.
3. Open **Actions → Deploy GitHub Pages** and wait for the green check.
4. Open the Pages URL on a phone through HTTPS so the browser can request camera access.

## Event-day workflow

1. The organizer opens `dashboard.html`, signs in, and creates an event.
2. The dashboard displays a new control code once. The organizer separately gives the code and the copied scanner-only link to assigned checkers.
3. A checker opens `scanner.html`, enters the code, starts the rear camera, and scans student IDs. The page has no links to organizer tools and does not retain the entered code.
4. The server verifies the student number against the protected roster and fills the next available time slot.
5. The scanner shows that student’s attended events and all recorded time-in/time-out slots. The report can be printed, saved as PDF, or downloaded as CSV.
6. The organizer refreshes the dashboard to see BEEd, BSE, BSA, and total attendance.
7. The organizer ends the event when attendance collection is complete.

## QR ID printing

Open `generator.html`, sign in with the organizer password, and load the roster. Select one student to apply and download a 2×2 photo card, or select a group to print blank photo-space IDs on A4 paper. QR codes contain only a version marker and student number; the Google Sheet remains the source of truth for the name and program.

## Local validation

No package installation is required.

```bash
npm test
npm run validate
```

The site uses pinned browser builds of `html5-qrcode` 2.3.8, `qrcodejs` 1.0.0, and `html2canvas` 1.4.1 from cdnjs.

## Privacy and operations

- Keep the GitHub repository free of exported student data and photos.
- Use strong administrator passwords and rotate control codes if a checker device is lost.
- GitHub Pages and the Apps Script web app both require internet access for live recording.
- The hidden `_USG_Control` tab stores only hashed codes, event metadata, and code versions. The plaintext control code is shown only when created or rotated.
