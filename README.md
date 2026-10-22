# Expenselake

Expenselake is a mobile-first household budget for a two-person home in Mexico. It uses MXN centavos, Firebase Authentication and Firestore for shared records, and in-browser OCR for receipt scanning. Receipt images are processed locally and are never uploaded to Firebase.

Create additional household-shared categories from the Budgets page. They become available for expense entry, category budgets, filters, charts, and CSV exports.

## Local setup

### Requirements

- Node.js 22.12 or newer and npm (required by the current Vite/Vitest toolchain)
- A Firebase project on the Spark (no-cost) plan, within its free quotas
- Java 11+ to run the Firebase Emulator Suite

### Install and run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Create a Firebase Web App, copy its configuration values into `.env.local`, enable **Email/Password** in Firebase Authentication, and create a Cloud Firestore database. Do not enable Firebase Storage or Cloud Functions for this app. Keep the project on the Spark plan and usage within Firebase's free quotas; Firebase may require a billing plan change if you enable other products or exceed those limits.

Create a household with your account, then generate an invitation in **Settings**. Invitation codes are shown once and must be shared privately; the recipient signs in with the invited email and enters the code.

## Environment configuration

The browser uses only Firebase's public Web App configuration:

| Variable | Purpose |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase Web App API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web App setting |
| `VITE_FIREBASE_APP_ID` | Firebase Web App setting |
| `VITE_USE_FIREBASE_EMULATORS` | Connect local development to emulators when `true` |

These Firebase Web App settings are public client configuration. Do not put private credentials or API secrets in `VITE_` variables.

## Receipt extraction

Receipt scanning uses Tesseract.js OCR in the browser. JPEG, PNG, and WebP images up to 8 MB are read from the selected local file; the app clears its file reference and preview after OCR completes (it does not delete the original from the user's device). A short-lived Firestore lease prevents the same account from processing more than one receipt at a time across devices; abandoned leases expire after 14 minutes. Only the reviewed expense fields are written to Firestore. The first OCR use downloads the free Spanish/English OCR engine and language data to the browser; receipt image bytes are not sent to a server. OCR can be slower or less accurate than a hosted vision service, so always review the extracted fields. Manual expense entry is also available.

## Firebase emulators

The configured emulator ports are Authentication `9099`, Firestore `8080`, and Emulator UI `4000`.

```bash
npm run emulators
```

Set `VITE_USE_FIREBASE_EMULATORS=true` in `.env.local` to use the Auth and Firestore emulators.

Firestore rule tests cover access boundaries, expense validation, temporary receipt records, per-user OCR locks, and invitation acceptance. Run them with:

```bash
npm run test:rules
```

They cover unauthenticated and cross-household reads, valid member expense create/edit/delete, invalid amounts, immutable creator identity, membership escalation and client-side invitation forgery. Emulator tests are skipped by the ordinary unit-test command unless explicitly run through the script above.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Deployment

1. Select the Firebase project with `firebase use <project-id>` (or pass `--project`).
2. Enable Email/Password Authentication and Firestore. Keep the Firebase project on Spark and monitor free-tier usage.
3. Set the Firebase Web App configuration in the deployment environment.
4. Deploy Firestore rules, indexes, and Hosting:

```bash
npm run deploy -- --project <project-id>
```

Or deploy services individually with `firebase deploy --only firestore:rules,firestore:indexes,hosting`.

The app does not deploy Firebase Storage or Cloud Functions. Firebase Auth and Firestore free-tier usage is subject to Firebase quotas and limits. Hosting can be used within its free quotas. Node 22.12+ is required for local frontend development and tests.

## Security model

- A household membership document with `active: true` is the boundary for shared records.
- Members can read household expenses; only the creator can edit or delete an expense.
- Only the owner can change household details or create member invitations. Firestore rules enforce invite email, one-time acceptance, and household capacity. Invite codes are high-entropy random values and must be shared privately.
- Receipt images stay in browser memory only while OCR is running. No image, OCR text, or receipt draft is uploaded to Firebase; only the expense details the user confirms are written to Firestore.
- Firestore stores all financial amounts as integer MXN centavos. `expenseDate` is a local calendar date (`YYYY-MM-DD`), not a UTC timestamp.

The MVP intentionally has no bank integrations, currency conversion, line-item extraction, offline expense writes, or email delivery provider. Invitation codes are tied to the recipient email, but the owner shares the code out-of-band.

### Existing Firebase resources

If you previously enabled Storage or deployed the earlier Cloud Functions, removing their configuration from this project does not delete those remote resources. In Firebase Console, remove any old receipt images from Storage and delete the unused bucket if you no longer need it; also delete the old `processReceipt`, `confirmReceipt`, `deleteExpense`, `createHouseholdInvitation`, and `acceptHouseholdInvitation` Functions. Check Google Cloud billing and usage before and after cleanup. Existing household documents need a `memberCount` field set to the number of active members (`1` or `2`) before the new invitation flow can be used.
