# PSU Balabac USG R2 File API

Cloudflare Worker API for the private R2 bucket bound as `USG_FILES`.

## Required binding
- `USG_FILES` -> `palsu-balabac-usg-files`

## Required variable
- `ALLOWED_ORIGIN` -> production site origin, or `*` temporarily for testing.

## Security
The Worker validates the Supabase bearer token using the Auth API, then reads the caller's own `profiles` row with that same JWT.

Students may only access:
- `student-photos/<their-user-id>/...`
- `student-id-copies/<their-user-id>/...`

Admins may access all approved prefixes:
- student-photos
- student-id-copies
- exam-proctor-photos
- exam-proctor-audio
- exam-stimuli

No Supabase service-role key is required.

## Endpoints
- `GET /api/health`
- `POST /api/files/upload?category=student-photos&filename=photo.jpg`
- `GET /api/files/<r2-key>`
- `HEAD /api/files/<r2-key>`
- `DELETE /api/files/<r2-key>`
- `GET /api/files/list?prefix=student-photos` (admin only)
