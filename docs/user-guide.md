# Using StudioAid

I designed StudioAid around a simple sequence: organize the project, prepare the shoot, track the money and finish delivery. This guide follows that sequence and explains how to keep a recoverable copy of the work.

[Project overview](../README.md) · [Development and releases](development.md) · [Signing setup](signing.md)

## Install and open the app

Download an installer from the repository's [Releases page](https://github.com/olonkpo/StudioAid/releases).

| Computer | Installer |
| --- | --- |
| Windows | `StudioAid-Setup-<version>.exe` |
| Mac with Apple Silicon | `StudioAid-<version>-mac-arm64.dmg` |
| Mac with an Intel processor | `StudioAid-<version>-mac-x64.dmg` |

On macOS, open the disk image and drag StudioAid into Applications. On Windows, run the setup file and follow its installation steps. On a Mac, **Apple menu → About This Mac** identifies the chip or processor.

An unsigned build may trigger an operating-system warning. Check the release's source and signing information before opening it. For a trusted unsigned macOS build, use **System Settings → Privacy & Security → Open Anyway** when that option is offered. Windows may offer **More info → Run anyway**. These prompts and available actions depend on the computer's security settings.

StudioAid places a floating bubble on the main screen and an icon in the menu bar or system tray. Open the bubble to show the board. The tray menu also provides **Open at login**, **Show data folder** and **Quit**.

Use **Option+Space** on macOS or **Ctrl+Alt+Space** on Windows to show or hide the panel. If the primary shortcut is unavailable, StudioAid tries **Ctrl+Option+Space** on macOS or **Ctrl+Shift+Space** on Windows.

## Set up the studio

For a new studio, the first-run guide asks for a studio name and currency. Add the optional sample portrait project to try the workflow before entering real work. Its initial price is zero; set a price in Payments when practicing an invoice or quote. Remove the sample when finished.

Reopen the guide from **Settings → Backups & updates → Open setup guide**. Configure business details, branding, tax defaults and invoice appearance in **Settings → Business & invoice**. Set the theme and bubble preferences in **Settings → General**.

On macOS, **Show in Dock** controls whether StudioAid appears in the Dock and Force Quit window. The menu-bar icon continues to provide Quit.

## Create a booking

Choose **New booking** from the studio's Projects page or quick actions. Enter a project name, client, date and price, then choose a timeline and booking stage. Add a start time and duration when checking availability.

The project workspace brings together the brief, location, package, client contact information, shot list and gear checklist. The studio workspace holds reusable contacts, packages, documents and templates.

Booking stages run from enquiry and quote through awaiting deposit, booked, completed or canceled. Change the stage as the booking progresses. Recording a payment or a client response does not change that stage automatically.

## Set board priorities

Drag the **⠿** handle beside a project and drop above or below another row. The marker shows the intended position. Higher rows have higher priority.

Focus a handle and press **↑ / ↓** for keyboard reordering. A move selects **Priority** sort and saves the order. Date and Name sorts remain available. When a search or filter is active, only visible projects move; hidden projects keep their positions. New projects begin at the bottom.

Open a project name for its details. Task cells remain interactive independently of the reorder handle.

## Schedule the work

Choose a Wedding, Portrait or Event timeline in **Workflow**, or apply a custom template. Automatic task dates are calculated from the shoot date. Moving the shoot moves unfinished automatic tasks; manually managed and completed deadlines remain in place. Review exceptions after rescheduling.

Save a project's timeline as a reusable template, or create one in **Settings → Workflow**. Each line in the editor uses this format:

```text
Preparation | Confirm brief | -7
Shoot | Photograph session | 0
Delivery | Deliver gallery | 14
```

Negative offsets are days before the shoot; positive offsets are days after it. Applied timelines are independent project copies, so later library edits or deletion do not rewrite existing projects.

In **Client & shoot**, set duration, setup time before the shoot and travel time afterward. Overlap warnings include these buffers and appointments that cross midnight. Archived and canceled bookings are excluded. The warning supports a scheduling decision; it does not block saving a booking.

## Prepare invoices and track payments

Set invoice lines, quantities, discount and tax in **Invoice**. Preview the invoice and use **Print or save as PDF** to produce a copy.

Marking an invoice as sent freezes its financial terms, currency, client details and business branding. Payments remain editable. Use **Create invoice revision** to change an issued invoice; the previous snapshot is retained.

In **Payments**, configure a percentage or fixed deposit and optional due dates. Add installments to divide the balance after the deposit. Recorded payments are allocated to the deposit first, then to installments in due-date order. Overcommitted plans show a warning and collection figures are capped at the invoice total; adjust the plan before exporting an offer.

StudioAid records payments received elsewhere. It does not charge a card or transfer money. Different currencies are shown separately without conversion.

For older invoices that did not have a stored snapshot, the app freezes the values available when it first opens them. It cannot reconstruct a historical invoice that was already changed. Retain the PDFs originally sent to clients.

## Manage delivery and communication

Use **Delivery** to track gallery sent, selections received, revisions, approval and final delivery. Keep the gallery link and revision requests with the project. An optional selections deadline highlights overdue client feedback.

Message drafts are saved separately for each project and template. **Reset draft to template** refreshes a draft and offers Undo. Email and WhatsApp buttons open the corresponding external application or browser; Copy provides a manual handoff.

Message and document templates support these fields:

| Field | Value |
| --- | --- |
| `{client_name}` or `{client}` | Client name |
| `{project_name}` or `{project}` | Project name |
| `{shoot_date}` or `{date}` | Shoot date |
| `{balance_due}` | Outstanding balance |
| `{studio_name}` or `{me}` | Studio/sign-off name |
| `{amount}` | Message- or document-specific amount |
| `{link}` | Gallery link in message templates |
| `{lines}` | Project invoice lines in document templates |

Document amounts use the project total; the payment-reminder amount uses the outstanding balance. Saved drafts retain edited text, so reset a draft when fresh template values are needed.

Client Desk provides a separate quote-and-response workflow. Its current preview has restricted access. Read the [Client Desk guide](../client-portal/README.md) before preparing invitations for clients.

## Review costs and repeat work

Record expenses and work time in **Costs & profit**. Estimated profit is revenue after discount, excluding sales tax, minus monetary expenses and time valued at the hourly rates entered. Cash net is payments received minus monetary expenses. Currency groups remain separate.

Use **Duplicate project** for repeat work. It copies the brief, effective pricing terms, optional client details, checklist text and timeline. Choose the new date to rebuild automatic deadlines. Invoice identity, payments, progress, costs, drafts and client-response or delivery history start fresh.

## Find work and configure reminders

Press **Command+K** on macOS or **Ctrl+K** on Windows while StudioAid has focus. Search projects, clients, invoices and documents, or use quick actions to create a booking, record a payment or complete a task. Completing a task offers Undo.

In **Settings → Backups & updates**, choose local reminders for tasks, payments, upcoming shoots and delivery follow-up. Set 0–30 days' notice before a shoot. StudioAid checks while running and sends one daily summary; notifications depend on operating-system permission. The reminder list opens the related project. Client messages are not sent automatically.

## Export or import data

Open **Settings → Backups & updates**.

- **JSON backup:** downloads the complete transferable studio, including invoice history, payments, templates and project order. Device-specific display and filter preferences are excluded.
- **CSV export:** produces project, client, payment, expense or work-time rows for spreadsheet use. Project CSV includes basic pricing rather than full invoice lines and history.
- **CSV import:** adds projects or clients after a preview. Existing records remain. All row errors must be corrected before import. Matching project name/client/date rows and matching client name/email rows are treated as duplicates and skipped.

Use an exported CSV as the starting template. Dates use `YYYY-MM-DD`; times use `HH:mm`; amounts use numbers without currency symbols. CSV imports are limited to 10,000 data rows and 2 MB per file. JSON file restoration accepts backups up to 20 MB.

## Restore a backup

1. Choose a JSON backup file or select a listed local backup copy.
2. Review its project, client and document counts.
3. Confirm that it will replace the current studio.
4. Choose **Restore this backup**.

A restore replaces data; it does not merge two studios. The desktop app validates the backup and keeps existing saved data in a recovery copy before replacement. If that copy cannot be written, the restore is rejected. If the studio changes after preview, select the backup again.

**Restore from text** remains available for copied JSON. In browser use, restoration keeps the previous saved state in browser storage; daily desktop backup selection is unavailable.

Local data is stored at:

- macOS: `~/Library/Application Support/StudioAid/data.json`
- Windows: `%APPDATA%\StudioAid\data.json`

The adjacent `backups` folder retains the most recent 14 daily copies. Separate `before-restore-…json` recovery copies preserve pre-restore data. **Show data folder** opens the location.

## Use Google Drive backup

Choose **Sign in with Google** under **Settings → Backups & updates** when the desktop build is configured for Google sign-in. StudioAid uses Drive's application-data folder rather than requesting general access to Drive files.

After sign-in, the app backs up changes and checks for remote changes at startup and periodically while running. Allow backup to finish before moving between computers. When local and remote work conflict, choose which copy to keep; the app does not merge individual project edits automatically. Local data is copied before an accepted replacement.

Google Drive backup is optional and is not end-to-end encrypted. Export a separate backup when moving or restoring a studio.

## Keep the app current

In **Settings → Backups & updates**, choose **Check**. When a compatible small update is available, StudioAid downloads its package, verifies the release checksum and restarts after installation. Some changes require a full installer.

The launcher retains recovery behavior for failed updates, using the previous healthy update when available or the bundled core. The recovery behavior available on a computer depends on its installed launcher version.

For release-building instructions, see [Development and releases](development.md). For certificate configuration and signed builds, see [Signing setup](signing.md).
