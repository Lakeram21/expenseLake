# Project: Receipt-First Household Budgeting App

Act as a senior full-stack software engineer, UI/UX designer, Firebase architect, and test engineer. Build a production-minded, mobile-first household budgeting application using React and Firebase.

Do not just give me instructions or sample snippets. Work directly in the project workspace, create and modify the necessary files, implement the features, run available tests, and fix errors. If the workspace already contains a project, inspect it before changing anything and preserve useful existing code.

## 1. Product vision

Build a clean, fast, easy-to-use budgeting app for a household shared by two people.

The primary purpose is to record expenses as quickly as possible. Users must be able to:

1. Photograph a receipt and automatically extract the total, merchant, and date.
2. Review and correct the extracted information before saving.
3. Enter an expense manually by typing an amount and selecting a category.
4. View household expenses and understand where the money goes.
5. Set monthly budgets and compare spending against those budgets.
6. View useful monthly and category-based reports.

The application must work well on mobile phones and desktop browsers.

The app is initially for a household in Mexico, with MXN as its only supported currency. Do not implement multi-currency conversion or bank integrations in the MVP.

Prioritize reliability, ease of use, security, maintainability, and a polished user experience over unnecessary complexity.

## 2. Technology stack

Use the following stack unless an existing project has a strong reason to differ:

- React
- TypeScript with strict type checking
- Vite
- Tailwind CSS
- Firebase Authentication
- Cloud Firestore
- Firebase Cloud Storage
- Firebase Cloud Functions using TypeScript
- Recharts for data visualization
- Vitest and React Testing Library for frontend tests
- Firebase Emulator Suite for security rules and backend testing where practical
- Firebase Hosting for deployment

Use stable, compatible package versions. Avoid unnecessary dependencies.

Build the frontend as an installable Progressive Web App (PWA) if practical, while keeping it fully usable in a normal browser. The interface should adapt to both mobile and desktop layouts.

## 3. Design and user experience

Create a modern personal-finance interface with clear typography, consistent spacing, accessible colors, subtle borders, attractive cards, and responsive layouts.

Use a professional, minimal design. Avoid clutter, excessive gradients, oversized decorative elements, and unnecessary animations.

Support accessible form controls, keyboard navigation, loading states, error messages, and confirmation dialogs for destructive actions.

### Main navigation

On desktop, use a sidebar with:

- Dashboard
- Expenses
- Budgets
- Reports
- Settings

On mobile, use compact bottom navigation with a prominent Add Expense action.

### Dashboard

Display:

- Total household spending for the selected month
- Overall monthly budget
- Remaining budget
- Budget utilization percentage
- Spending by category
- Recent transactions
- A monthly spending trend
- Quick actions for scanning a receipt and manually entering an expense

Allow users to navigate between months.

Handle overspending correctly. Never display a negative remaining budget as if it were positive.

Show empty states when no expenses or budgets exist. Do not populate production data with fake transactions.

### Expense entry

Provide two primary actions:

**A. Quick manual entry**

The user should be able to enter an amount, select a category, and save an expense with minimal interaction.

Fields:
- Amount, required
- Category, required
- Date, defaulting to today
- Merchant, optional
- Payment method, optional
- Notes, optional

Support cash, debit card, credit card, bank transfer, and other as payment methods.

Use sensible defaults and make optional fields unobtrusive.

**B. Receipt entry**

Allow users to take a photo on mobile or upload an image from a desktop or mobile device.

Supported image formats should include JPEG, PNG, and WebP.

Provide image preview, upload progress, processing feedback, retry behavior, and a clear error state.

Once extraction finishes, show an editable confirmation form with:
- Merchant
- Date
- Extracted total
- Suggested category
- Optional payment method

The user must explicitly confirm the expense before it is saved.

Never silently save an uncertain AI extraction.

### Expense history

Provide:
- A searchable transaction list
- Date range filters
- Category filters
- Merchant search
- Monthly grouping
- Expense detail view
- Edit and delete actions
- Receipt image preview when available

Make it clear who created each transaction so household members can understand who recorded it.

### Budgets

Allow users to create and edit monthly spending limits by category.

Display:
- Budget amount
- Actual spending
- Remaining amount
- Percentage used

Show warnings when a budget approaches its limit and a clear overspending state when it exceeds the limit.

Avoid double-counting expenses.

### Reports

Include:
- Total spending by month
- Spending by category
- Spending by merchant
- Monthly spending trends
- Month-over-month comparisons
- Spending by household member

Provide date filtering and an export-to-CSV option.

Ensure CSV values are properly escaped and that exported data belongs only to the current household.

## 4. Household accounts and authentication

Use Firebase Authentication for sign-in.

Support a household shared by two people. Both household members should be able to see the same expenses, budgets, and reports.

Implement:
- User profile
- Household creation
- Household membership
- Invitation flow for a second member
- Membership roles
- Sign-out
- Protected routes

Use an owner role and a member role.

Only authorized users may manage household membership. Do not allow a user to grant themselves access simply by writing a membership document from the client.

For invitations, use a trusted Cloud Function or another secure, server-validated invitation mechanism. Validate the invite, expiration, intended recipient where applicable, and caller authorization.

A household member can create expenses and view household records. Initially, allow users to edit and delete only expenses they created, while permitting both members to view all household expenses.

Do not assume a household ID supplied by the browser is trustworthy. Verify membership and authorization on every protected backend operation.

## 5. Firestore data model

Use the household as the primary boundary for shared financial records.

Suggested structure:

users/{uid}

Fields:
- displayName
- email
- defaultHouseholdId
- createdAt
- updatedAt

households/{householdId}

Fields:
- name
- ownerUid
- currency: "MXN"
- createdAt
- updatedAt

households/{householdId}/members/{uid}

Fields:
- role: "owner" | "member"
- active
- joinedAt

households/{householdId}/expenses/{expenseId}

Fields:
- amountMinor: integer representing MXN centavos
- currency: "MXN"
- merchant: string or null
- categoryId: string
- expenseDate: "YYYY-MM-DD"
- paymentMethod: string or null
- source: "manual" | "receipt"
- receiptPath: string or null
- notes: string
- createdBy: Firebase UID
- createdAt: Firestore timestamp
- updatedAt: Firestore timestamp

households/{householdId}/budgets/{budgetId}

Fields:
- month: "YYYY-MM"
- categoryId: string
- limitMinor: integer
- currency: "MXN"
- updatedAt: Firestore timestamp

households/{householdId}/categories/{categoryId}

Fields:
- name
- icon
- active
- sortOrder
- createdAt

Use deterministic budget IDs where appropriate, such as "2026-10_groceries", to enforce one budget per category per month.

You may improve this model when necessary, but document the reasons and keep it straightforward.

Use integer centavos for all monetary calculations. For example, MXN $1,248.50 must be stored as 124850. Never rely on floating-point arithmetic for financial totals.

Use Firestore server timestamps for creation and modification times. Use the expense date as a local calendar date so transactions are grouped into the intended month regardless of timezone.

Create the necessary Firestore indexes for the queries implemented.

## 6. Receipt extraction pipeline

Implement a secure receipt-processing workflow.

The workflow must be:

1. The authenticated user selects or captures an image.
2. The frontend validates file type and size.
3. The image is uploaded to a private Firebase Storage path scoped to the household and a generated receipt or draft identifier.
4. The frontend invokes an authenticated Cloud Function.
5. The Cloud Function verifies the caller's identity and active household membership.
6. The function validates the storage path and confirms that the image belongs to the authorized household.
7. The backend sends the image to a configurable OCR or vision AI provider.
8. The provider returns structured receipt data.
9. The backend validates and normalizes the response.
10. The frontend displays an editable confirmation screen.
11. Only after user confirmation is the expense created in Firestore.

Extract only:
- Merchant name
- Receipt date
- Final payable total
- Suggested expense category
- Extraction warnings or review status

Do not extract individual receipt line items in the MVP.

### Extraction accuracy

The extraction prompt must explicitly distinguish:
- Subtotal
- Tax
- Grand total
- Cash tendered
- Change
- Card payment amount
- Discounts

Prefer the final payable total. If multiple totals are present or the total is ambiguous, flag the result for manual review.

Validate:
- The amount is a positive, finite value within a sensible configurable limit.
- The date is valid.
- The merchant is a string or null.
- The currency is MXN or the extraction requires user review.
- The category belongs to the household's allowed categories.

Normalize the amount into integer centavos.

Do not trust model-generated confidence scores unless the provider documents their meaning. If reliable confidence information is unavailable, use explicit validation and review flags instead.

If extraction fails, preserve the uploaded image temporarily as a retryable draft, explain the failure, and let the user retry or enter the expense manually.

Prevent accidental duplicate submissions. Use a stable draft or request ID, enforce valid processing states, and ensure retrying a completed request does not create a second expense.

Keep receipt-processing states explicit, such as:
- uploaded
- processing
- needs_review
- confirmed
- failed

Do not expose provider credentials or private server configuration to the frontend.

### Provider integration

Implement a provider abstraction so the OCR/AI service can be changed without rewriting the frontend.

Use a configurable server-side provider and environment-based secrets.

Do not hardcode API keys. Do not invent credentials or pretend the integration works if credentials are missing.

If no provider credentials are available, complete the upload, data structures, interfaces, mock provider for local tests, and review UI. Clearly document how to configure the real provider.

Add sensible limits for upload size, image type, API timeouts, retry attempts, and usage. Avoid logging receipt images, API secrets, or unnecessary personal financial information.

## 7. Security rules

Create restrictive firestore.rules and storage.rules.

Firestore rules must:
- Require authentication for private data.
- Check active household membership.
- Prevent access across households.
- Validate allowed fields, types, positive integer amounts, currency, and valid source values.
- Prevent changing createdBy during updates.
- Prevent ordinary users from modifying owner or membership records.
- Prevent unauthorized household creation or membership escalation.
- Restrict expense updates and deletion according to the ownership policy above.
- Restrict budgets and categories to authorized household members and roles.

Storage rules must:
- Require authentication.
- Validate active household membership.
- Restrict access to household-scoped receipt paths.
- Restrict image MIME types and maximum upload size.
- Prevent public receipt access.

Remember that Firebase Admin SDK operations bypass Firestore Security Rules. Every privileged Cloud Function must independently authenticate and authorize its caller, validate input, and restrict its actions.

Do not store API keys in Firestore or client-side environment variables exposed to the browser.

Write security rules tests using the Firebase Emulator Suite when possible. Include tests for unauthorized access, cross-household access, invalid amounts, membership escalation, and attempts to modify protected fields.

## 8. Code organization

Use a maintainable structure similar to:

src/
  app/
  components/
    layout/
    forms/
    expenses/
    charts/
  features/
    auth/
    household/
    dashboard/
    expenses/
    receipts/
    budgets/
    reports/
  lib/
    firebase.ts
    money.ts
    dates.ts
  services/
    expenseService.ts
    budgetService.ts
    receiptService.ts
  types/

functions/
  src/
    index.ts
    receipts/
    households/

firestore.rules
storage.rules
firestore.indexes.json

Separate:
- UI components
- Data access
- Business logic
- Type definitions
- Receipt processing
- Authentication and authorization

Use reusable form components and typed service functions. Avoid putting all logic in a single component or a single giant file.

Use proper error handling. Never silently swallow errors.

## 9. Testing requirements

Add tests for:
- Manual expense creation
- Monetary conversion to and from centavos
- Editing and deleting expenses
- Monthly aggregation
- Category budget calculations
- Date boundaries and timezone behavior
- Receipt parsing and normalization
- Ambiguous receipt totals
- Invalid or oversized uploads
- Duplicate processing attempts
- Household authorization
- Security rules

Include representative test receipts or synthetic extraction responses. Do not require real AI credentials for unit tests.

Run the available test suite, TypeScript checks, and production build. Fix failures before considering a stage complete.

## 10. Implementation workflow

Work incrementally rather than generating the entire app in one pass.

### Phase 1: Inspect and scaffold
- Inspect the current workspace.
- Identify the existing code and package manager.
- Create or adapt the Vite React TypeScript project.
- Install and configure dependencies.
- Create the app shell and responsive navigation.
- Add a README and environment variable example.

### Phase 2: Firebase and household
- Configure Firebase client initialization.
- Implement authentication.
- Create the household and membership model.
- Add protected routes.
- Write initial Firestore and Storage security rules.
- Test access restrictions.

### Phase 3: Expense management
- Implement manual expense entry.
- Implement the expense history.
- Add editing, deletion, filtering, and search.
- Implement money and date utilities.
- Add unit and integration tests.

### Phase 4: Receipt processing
- Implement image capture and upload.
- Implement the Cloud Function and provider abstraction.
- Implement extraction validation.
- Build the receipt confirmation UI.
- Add retry and duplicate prevention.
- Test the workflow using a mock provider.

### Phase 5: Budgets and reporting
- Implement category management.
- Implement monthly budgets.
- Build dashboard summaries and charts.
- Add month filters and CSV export.

### Phase 6: Final verification
- Run tests.
- Run TypeScript checks.
- Run the production build.
- Review security rules.
- Fix bugs and accessibility issues.
- Document deployment and configuration.

After each phase, report:
1. What was implemented.
2. Which files were created or modified.
3. Which tests and commands were run.
4. Any failures or unresolved issues.
5. The next recommended step.

Do not claim a test, deployment, or external integration succeeded unless you actually ran it and verified the result.

If you encounter a missing credential or an unavailable external service, continue with a testable implementation and document the missing setup rather than blocking all progress.

## 11. Development commands and documentation

Provide working package scripts for:
- Development server
- Production build
- Linting
- Unit tests
- TypeScript validation
- Firebase emulator development where configured

Create:
- README.md with setup instructions
- .env.example with placeholder variable names only
- Firebase deployment instructions
- Receipt provider configuration instructions
- Security notes
- Test instructions

Ensure secrets are excluded from version control. Include a suitable .gitignore.

Document which Firebase services require a billing-enabled project and identify any external API usage costs that may apply.

## 12. Definition of done

The MVP is complete when:

- The app runs locally.
- A user can authenticate.
- Two household members can securely share expenses.
- Manual expenses can be created, viewed, edited, and deleted according to the access policy.
- A receipt can be uploaded and processed through the mock provider.
- Extracted information can be reviewed and corrected before saving.
- Duplicate receipt submissions do not create duplicate expenses.
- Budgets and reports calculate totals correctly using integer centavos.
- The interface works on mobile and desktop.
- Security rules and core business logic have tests.
- The production build succeeds.
- Setup and deployment instructions are documented.

## Start now

First inspect the project workspace and report what already exists. Then begin Phase 1 and continue into subsequent phases as the environment and available time allow.

Do not stop after producing a plan. Implement the application directly, test your work, and leave the project in the most complete, verified state possible. If the work cannot all be completed in one session, finish the current phase cleanly and report precisely what remains.