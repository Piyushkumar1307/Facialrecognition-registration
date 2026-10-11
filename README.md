# FaceCheck

FaceCheck is a private, consent-based face lookup portal.

- `/` opens a camera only after a visitor presses **Start camera**, captures one JPEG frame, and looks up the best match in an AWS Rekognition collection.
- `/adduser` lets an administrator drag in a CSV of people. Rows with a reference-image URL are stored as authenticated Cloudinary assets, indexed in Rekognition, and linked to the person in Neon Postgres.
- Live scan frames are sent to Rekognition for the check and are **not** written to Cloudinary or the database.

## How the pieces fit

```text
webcam frame  ->  /api/scan  ->  Rekognition SearchFacesByImage  ->  Neon profile
CSV row + image URL  ->  Cloudinary (authenticated) + Rekognition IndexFaces  ->  Neon profile
```

The app uses a Rekognition collection because the scan flow is a 1:N lookup (the visitor does not first claim an ID). `CompareFaces` is better suited to a separate 1:1 verification flow.

## Set up locally

1. Copy `.dev.vars.example` to `.dev.vars` and fill in every required value. Do not commit that file.
2. Create a Rekognition collection once:

   ```sh
   npm run rekognition:create-collection
   ```

3. Start the app:

   ```sh
   npm run dev
   ```

4. Open the local URL shown in the terminal. The portable development profile simulates ChatGPT sign-in; use its local sign-in route when prompted.

For an audited database setup, run [db/neon-schema.sql](db/neon-schema.sql) in Neon. The application also creates the same table on its first successful database request.

## Required runtime secrets

All secrets must be server-side deployment secrets—never `NEXT_PUBLIC_*` values and never browser code.

| Secret | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon pooled Postgres connection string |
| `AWS_REGION` | AWS region containing the collection |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Runtime IAM credentials |
| `AWS_REKOGNITION_COLLECTION_ID` | Existing collection ID |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Server-only Cloudinary upload credentials |
| `CLOUDINARY_FOLDER` | Folder for authenticated reference assets |
| `SITE_AUTH_MODE` | Set to `passcode` on Render; omit on ChatGPT Sites |
| `SITE_PASSCODE` | Main-site login passcode for Render and other non-Sites hosts |
| `ADDUSER_PASSCODE` | Server-side passcode required before using `/adduser` |

Optional safety tuning: `FACE_MATCH_THRESHOLD` (default `95`), `FACE_MATCH_MARGIN` (default `3`), and `MAX_IMAGE_BYTES` (capped at `5,000,000`).

The runtime IAM identity needs `rekognition:DetectFaces`, `rekognition:SearchFacesByImage`, `rekognition:IndexFaces`, and `rekognition:DeleteFaces` for the selected collection. Keep `CreateCollection` out of the production credential; it is only needed for the one-time local setup script.

## CSV format

Download the template from `/adduser`, or use these headers:

```csv
external_id,full_name,age,profession,face_image_url
E-1001,Ada Lovelace,31,Software engineer,https://example.com/ada.jpg
```

`external_id` and `full_name` are required. `age` (a whole number from 1–130) and `profession` are optional profile fields that are shown after a confirmed match. `face_image_url` is optional for a plain profile import, but a user cannot match until a JPEG or PNG reference image is enrolled. The importer accepts common aliases such as `id`, `employee_id`, `name`, and `image_url`; it sends five rows at a time to keep external work bounded. Re-importing an external ID updates the profile and safely replaces its indexed face when a new reference image is supplied.

The importer accepts **CSV** files. Excel can open and edit the CSV directly; if you save an `.xlsx` workbook, use **Save As → CSV UTF-8** before dropping it into `/adduser`.

Reference image URLs must be reachable over HTTP(S), must not point to private/localhost networks, must be JPEG/PNG, and must be at most 5 MB. Cloudinary receives the accepted reference as an `authenticated` asset; the original source URL is not retained in Neon.

## Deployment and access

The hosted Site starts private. Add the secrets through its runtime environment-variable controls, then deploy a new version. A signed-in visitor must also enter `ADDUSER_PASSCODE` before `/adduser` and its import API unlock for that browser. Changing the passcode immediately invalidates existing unlock cookies.

### Render

Set every required secret above in the Render service environment. Set
`SITE_AUTH_MODE=passcode` and choose a long `SITE_PASSCODE`. FaceCheck then uses
`/login` and an HTTP-only signed cookie on Render; ChatGPT Sites authenticated-user
headers continue to work when hosted on Sites. Keep `SITE_PASSCODE` different
from `ADDUSER_PASSCODE`.

Use a different least-privilege AWS credential for production. If an access key was ever put in client code, Git history, or chat, rotate it before using this app.

## Safety notes

Face images and face vectors are sensitive biometric data. Obtain informed consent, define retention/deletion and re-enrollment processes, restrict administrators, and show only the profile fields your scanner is authorized to see. This app checks visual similarity; it does not provide liveness detection. Do not use it as the sole control for access, attendance, employment, safety, or other consequential decisions—add Rekognition Face Liveness and a separate factor where appropriate, and validate thresholds on consented, representative data.
