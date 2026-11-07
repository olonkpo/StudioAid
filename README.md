# StudioAid (Mac and Windows)

A floating bubble that stays on top of your other apps. Tap it (or use the shortcut) to open your project board, calendar and studio workspace.

## First run (about 5 minutes)

1. Install Node.js from https://nodejs.org (choose the LTS version).
2. Open a terminal in this folder.
   - Mac: open Terminal, type `cd ` (with a space), drag this folder into the window, press Return.
   - Windows: open the folder in File Explorer, click the address bar, type `cmd`, press Enter.
3. Run: `npm install`
4. Run: `npm start`

The bubble appears at the right edge of your main screen, and a small icon appears in the menu bar (Mac) or system tray (Windows, near the clock; you may need to click the ^ arrow). Its menu has: Show or hide panel, Open at login, Show data folder, Quit.

## Shortcut to show or hide the panel

- Mac: Option+Space (falls back to Control+Option+Space if taken)
- Windows: Control+Alt+Space (falls back to Control+Shift+Space if taken)

## Moving your existing data

1. On the original computer, open **Settings → Backups & updates** and choose **Copy backup text**.
2. Save the copied text in a private file before changing computers or restoring data.
3. On the destination computer, open **Settings → Backups & updates**, choose **Restore from text**, paste the backup, then choose **Restore from text** again.

Keep a backup of the destination computer's work before replacing it. A restore replaces its studio data; it does not merge two studios. The desktop app validates the incoming snapshot and saves a `before-restore-…json` safety copy before replacing its data file. If validation or the safety copy fails, the restore is rejected.

## Where your data lives

- Mac: ~/Library/Application Support/StudioAid/data.json
- Windows: %APPDATA%\StudioAid\data.json

A daily copy is kept in the `backups` folder next to it (the last 14 days). "Show data folder" in the menu opens it.

## Get a normal installer (no Terminal needed)

1. Open this repository's **Actions** tab and choose **Build installers**.
2. Choose **Run workflow**, select the branch containing the changes (normally **main**), then choose **Run workflow** again.
3. Wait for **Test app behavior**, both installer builds, and the release job to finish successfully.
4. Open the repository's **Releases** page and download the installer for your computer. The release also contains the small package used by the app's built-in updater.

The workflow creates the version and tag automatically. The tag points to the exact commit used for that build, even if the branch receives more changes while the installers are building.

Maintainers setting up a new repository should upload the complete project, including `.github/workflows`, and allow GitHub Actions to run.

## Which file do I download?

- **Windows:** `StudioAid-Setup-<version>.exe`
- **Mac with an Apple chip (M1, M2, M3 and later):** `StudioAid-<version>-mac-arm64.dmg`
- **Mac with an Intel chip:** `StudioAid-<version>-mac-x64.dmg`

Not sure which Mac you have? Click the Apple menu, then About This Mac. If it says Chip, it is Apple; if it says Processor, it is Intel. The app's own "Check for updates" picks the right file for you.

## Building on your own computer instead

- On a Mac: `npm run dist:mac` makes separate Apple Silicon and Intel .dmg installers in the `dist` folder.
- On Windows: `npm run dist:win` makes an installer in the `dist` folder.

## Opening the app the first time

The installers are not signed with a paid developer certificate, so the computer will warn you once.

- **Mac:** Open the .dmg and drag StudioAid into Applications. Double-click it. If macOS says it cannot verify the app, open System Settings, then Privacy & Security, scroll down, and press "Open Anyway" next to StudioAid. On older macOS you can instead right-click the app and choose Open. If macOS says the app is "damaged", run this once in Terminal: `xattr -cr "/Applications/StudioAid.app"`
- **Windows:** If SmartScreen warns about an unknown publisher, choose "More info", then "Run anyway".

Removing these warnings entirely requires paid developer accounts (Apple Developer Program for Mac, a code-signing certificate for Windows).

## Updates

Open **Settings → Backups & updates** and press **Check** under Updates. Most updates use a small package: the app downloads only the changed program files, checks them against a fingerprint, and restarts. You do not reinstall anything. A full installer is only needed now and then, when the app's engine itself changes; the app tells you when. If a small update ever fails to start, the app switches back to the installed version by itself.

Changes to the launcher (`main.js`), including startup rollback behavior, require a full installer. A small update replaces the app core but keeps the launcher from the installed version.

## Cloud backup (Google Drive)

Open **Settings → Backups & updates → Sign in with Google**. Your browser opens, you approve, and StudioAid keeps a private backup in a hidden app folder of your own Google Drive. Only StudioAid can see it, and your other Drive files are not touched. After that it backs up automatically a few seconds after you change something. On a new computer, sign in and your data is fetched. If two computers have different data, the app asks which to keep before anything is overwritten, and it keeps a safety copy of the local data first.

Maintainers: the Google client ID and secret are not stored in the repository. Add them as repository secrets named GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (Settings, Secrets and variables, Actions) and the build writes them into the app.

## Dock and Force Quit (Mac)

By default StudioAid shows in the Dock, so it appears in the Force Quit window (Command+Option+Esc). If you prefer a menu-bar-only app that can float over full-screen apps, turn off **Show in Dock** in **Settings → General**. The menu bar icon always has Quit.

## Notes

- The bubble lives on your main screen only.
- You will be asked once to allow notifications. You get one a day when steps are due or overdue.
- Email and WhatsApp buttons open your default mail app and browser.
- Google Drive backup checks for changes on startup and periodically while the app is running. Keep both computers online and allow backup to finish before switching; conflicting edits require you to choose which copy to keep.


## Validation before a release

Run `npm test` to check the app's data and calculation behavior. These tests use Node's built-in test runner and do not require Electron to launch. GitHub runs them on Linux, macOS, and Windows for pushes to main, pull requests, and before packaging installers.

Before distributing a release, also open the app on Mac and Windows and check the bubble and keyboard shortcut, settings navigation, invoice preview and printed output, backup export and restore, and updating from the previous version. Automated checks do not replace these desktop checks.

The app and its small update package include the shared data, invoice model, workflow, booking, quick-search, operations and client-response modules. Keep their packaging lists in sync when adding shared app modules. The release workflow pins the ASAR packer version so its Node requirements do not change unexpectedly.

## Invoice consistency and revisions

Invoice totals, payment balances and reminder amounts use the same calculation. Once marked as sent, an invoice keeps its tax, currency, client details and business branding. Payment records can still be added. Use **Create invoice revision** to reopen the invoice for editing; its previous snapshot is retained. Money summaries and reports show different currencies separately, without converting or adding them together.

Existing sent invoices are frozen at their current saved values when this update first opens them. This cannot reconstruct an older invoice that was already changed by previous app versions. Compare important invoices against the PDFs you originally sent.

Settings now previews the same invoice renderer used for printing. In browser-only use, export a backup separately; the desktop app provides the daily local backup copies.

## Project workflows and scheduling

Choose a Wedding, Portrait or Event workflow preset for an individual project. The preset supplies that project's phases and steps, with suggested task dates relative to the shoot date. Other projects keep their own workflow.

When the shoot date changes, automatic task dates move with it. Dates you set manually are preserved, including manually managed tasks from an earlier preset. Review the task dates after applying a new preset or rescheduling a shoot.

## Booking and payment milestones

Track a project's booking stage from enquiry and quote through awaiting deposit, booked, completed or canceled. Set a deposit as a percentage or a fixed amount, plus optional deposit and balance due dates. Deposit percentages run from 0 to 100.

Milestones use the project's invoice total and recorded payments to show what is still due. Recording money and changing the booking stage remain deliberate actions; a milestone does not send a message or collect a payment.

## Quick actions

While StudioAid has focus, press **Command+K** on Mac or **Control+K** on Windows to open quick actions. You can also choose **Search / actions** in the panel or right-click the bubble. Search projects, clients, invoices or documents and open the selected result from the keyboard. Quick actions also let you create a booking, record a payment or complete a task; completing a task offers Undo.

## Conflicts and reusable timelines

Set a start time, shoot duration, setup buffer and travel buffer in **Client & shoot**. Overlap warnings include those buffers and shoots that run past midnight. Archived and canceled bookings do not block the schedule. Warnings help you decide whether to reschedule; they do not prevent a booking.

Save a project's timeline as a reusable template from **Workflow**, or create and edit templates in **Settings → Workflow**. Task offsets are days before or after the shoot date. Applying a template stores an independent copy on the project, so editing or deleting the library template keeps existing project timelines intact.

## Delivery, drafts and repeat work

Use **Delivery** to track gallery sent, selections received, revision requests, approval and final delivery. Optional selection deadlines highlight clients you are waiting for. These stages and notes are changed by you.

Messages save unfinished subject and message text separately for each project and template. Returning to a message restores the saved draft. **Reset draft to template** restores the template and offers Undo.

**Duplicate project** copies the brief, effective prices and tax, currency, client details (optional), checklist text and timeline into a new enquiry. Pick its shoot date to rebuild automatic deadlines. Payments, invoice identities, progress, expenses, drafts, gallery links and delivery or approval history start fresh.

## Costs, profit and installments

Record expenses and work time in **Costs & profit**. Estimated profit uses revenue after discount, excluding sales tax, minus expenses and time valued at the hourly rates you enter. Reports show currencies separately; there is no currency conversion. Work time is an estimate of labor cost, while cash net subtracts monetary expenses from payments received.

Add installment amounts and optional due dates under **Payments**. These amounts divide the balance after the deposit. Received payments cover the deposit first, followed by installments in due-date order. Overcommitted plans show a warning and are capped at the invoice total; adjust the plan before exporting a client offer. Stages and payment records remain deliberate actions.

## Client Desk

The project's **Client page** exports a quote containing the intended client details, shoot details, prices and payment plan. Open [Client Desk](https://studioaid-client-desk.pebblyowlet8.chatgpt.site), sign in, upload the offer and generate an expiring invitation. Download the client's response and import it into the matching StudioAid project for review before applying it. Applying a response preserves prices and does not mark a booking as confirmed or paid. Changed quotes require a fresh offer.

Client Desk is currently owner-private while external client access awaits approval. The platform gate blocks outside clients until its audience is changed. Once external access is enabled, individual offers still require their secret invitation link, and the studio dashboard requires sign-in. This companion is separate from the desktop installer; it does not automatically upload or synchronize your studio. See [the companion README](client-portal/README.md) for its build, storage and access details.
