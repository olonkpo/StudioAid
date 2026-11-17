# StudioAid

**A desktop workspace for managing the work around photography.**

I built StudioAid to bring projects, clients, schedules, invoices and delivery into one place. My aim is straightforward: make the business side of a small studio easier to follow, without pulling attention away from the creative work.

StudioAid runs on macOS and Windows. Its floating bubble keeps the workspace within reach, with a project board, calendar and studio panel available when needed.

[Download a release](https://github.com/olonkpo/StudioAid/releases) · [User guide](docs/user-guide.md) · [Development and releases](docs/development.md) · [Client Desk](client-portal/README.md)

## Why I built it

A photography project involves much more than the shoot. It includes enquiries, preparation, deposits, editing, client feedback and final delivery. When those details sit in separate lists, messages and spreadsheets, it becomes harder to see what needs attention.

I designed StudioAid around that problem. Each project brings its client details, tasks, dates, payment records and delivery progress into a single workspace. The board shows the work across projects; the project view holds the details behind it.

## Problems I designed StudioAid to solve

| Problem | What I built | Practical benefit |
| --- | --- | --- |
| Priorities change, but a static list does not reflect them. | A project board with saved drag-and-drop ordering and keyboard controls. | Put the most important work at the top without changing project details. |
| Moving a shoot can leave preparation and delivery dates out of step. | Shoot-relative timelines that preserve manual and completed deadlines. | Reschedule automatic tasks while keeping deliberate exceptions. |
| A free time slot may still leave no room for setup or travel. | Duration, setup and travel buffers with overlap warnings. | Review the full appointment window before committing to another shoot. |
| Deposits, balances and staged payments are easy to lose track of. | Booking stages, payment records, deposit requirements and installments. | See the next payment requirement alongside the booking. |
| An invoice can become inconsistent after it has been sent. | Frozen issued-invoice details and explicit revisions. | Retain the original financial record while recording later payments. |
| Revenue alone does not show the cost of delivering a job. | Expenses, work-time valuation and estimated profit by currency. | Review monetary costs and estimated labor alongside project revenue. |
| Client feedback can stall delivery without a clear next step. | Gallery, selections, revisions, approval and delivery tracking. | Identify projects waiting on a client and keep requests with the job. |
| Repeated work can mean re-entering the same information. | Reusable timelines, project duplication and saved message drafts. | Reuse the brief and process while starting new work with fresh history. |
| Data needs to remain usable outside the app. | Complete JSON backups, spreadsheet CSV exports and previewed imports. | Keep a transferable copy of the studio and review incoming data before applying it. |
| A restore or conflicting edit can put current work at risk. | Validated restores, recovery copies and explicit cloud-conflict choices. | Review replacement data and retain a recovery path. |

## How the workspace fits together

**Board and calendar.** Review progress across projects, reorder priorities, filter active or archived work, and see shoots and task deadlines on the calendar.

**Project workspace.** Keep client information, briefs, shot lists, gear checklists, workflows, payments, invoices, delivery status, costs, messages and notes with the project.

**Studio workspace.** Manage contacts, packages, documents and templates, then review money summaries and reports. Different currencies remain separate.

**Quick actions and reminders.** Use Command/Ctrl+K to find work or record an action. Configure local reminders for tasks, payments, approaching shoots and delivery follow-up.

**Client Desk.** I built a separate hosted companion for sharing a limited quote and collecting a client's response. It uses an explicit offer-and-response handoff so the desktop project remains under the studio's control. Client Desk is currently an access-restricted preview; see its [access and workflow documentation](client-portal/README.md).

## Getting started

1. Download the appropriate installer from [Releases](https://github.com/olonkpo/StudioAid/releases).
2. Install StudioAid and open the floating bubble or use the system shortcut below.
3. Set your studio name and currency. The first-run guide can add a zero-price sample portrait project.
4. Create a booking, choose a timeline, review the payment plan and prepare the project's invoice or quote.

| Action | macOS | Windows |
| --- | --- | --- |
| Show or hide the panel | Option+Space | Ctrl+Alt+Space |
| Fallback if the shortcut is unavailable | Ctrl+Option+Space | Ctrl+Shift+Space |
| Open quick actions while StudioAid has focus | Command+K | Ctrl+K |

The menu-bar or system-tray menu provides panel visibility, launch-at-login, the data folder and Quit. The [user guide](docs/user-guide.md) covers installation, everyday workflows, imports, backups and updates.

## Design choices

I keep studio data local by default, with optional Google Drive backup. Core project work does not require a cloud connection. JSON backups retain the complete transferable studio; CSV supports basic project/client migration and spreadsheet analysis.

I keep financial changes deliberate. Recording a payment does not collect money, and approving a quote does not automatically confirm a booking. Reports separate currencies rather than assuming an exchange rate. Estimated profit distinguishes time valuation from cash expenses.

I also keep recovery visible. The app reports save failures, validates incoming backups, and preserves existing data before a desktop restore. The updater checks downloaded packages against their release checksum and retains a recovery path for failed updates.

## Availability and scope

This documentation describes the source on `main`. An installer includes the code at its release tag, so recent changes may appear here before a new installer is published.

The signed-installer workflow is configured, but a signed release requires valid certificates and a successful build. [Signing setup](docs/signing.md) explains the requirements. Client Desk has separate hosting and access controls from the desktop app.

StudioAid currently records payments; it does not process them. Its quote responses are not electronic contract signatures. Email and WhatsApp actions open external applications. Local reminders require StudioAid to be running. Google Drive backup is not end-to-end encrypted.

## Development

StudioAid uses Electron with shared modules for data validation, financial calculations, scheduling, bookings, search and studio tools. Automated behavior checks run on macOS, Windows and Linux.

See [Development and releases](docs/development.md) for local setup, packaging, validation and release configuration.
