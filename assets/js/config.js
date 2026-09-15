window.USG_ATTENDANCE_CONFIG = Object.freeze({
  // Keep "legacy" until SUPABASE_SETUP.md Stage 1 is verified. Change this to
  // "supabase" for the final scanner/control/report cutover.
  backendMode: "legacy",
  // Supabase values that are safe for public browser code. Never add a secret
  // key or the legacy service-role key to this file.
  supabaseUrl: "https://edfcehmttcwhhknywflq.supabase.co",
  supabasePublishableKey: "sb_publishable_XDI9PRlXfmA31Os3lQtthA_-gqwNXFI",
  // The administrator enters the USG email on the private sign-in screen. Do
  // not publish a personal or organizational sign-in address in this file.
  adminEmail: "",
  studentEmailDomain: "students.psubalabac.invalid",

  // Permanent Google Apps Script web app deployment URL.
  // Kept temporarily so the live scanner continues to work during migration.
  apiUrl: "https://script.google.com/macros/s/AKfycbzUWHW8RVzW58gQQIWSn6krWFczh8zeqndmDpYc_6nQsKFUmbz1UQf874tWNNw9Uz4V/exec",
  campusName: "Palawan State University – Balabac Campus",
  organizationName: "University Student Government",
});
