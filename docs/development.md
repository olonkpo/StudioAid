# Development and releases

I keep the desktop interface and its business rules in the same repository, with shared modules for calculations and validation. This makes it possible to exercise financial, scheduling and persistence behavior without launching Electron.

[Project overview](../README.md) · [User guide](user-guide.md) · [Signing setup](signing.md)

## Run locally

Install a Node.js LTS version compatible with the project's Electron tooling. GitHub's behavior checks use Node.js 20. Open a terminal in the repository root and run:

```sh
npm install
npm start
```

StudioAid opens as a floating bubble. Use its menu-bar/system-tray menu or system shortcut to show the workspace or quit.

## Code structure

| File | Responsibility |
| --- | --- |
| `main.js` | Launcher, update selection and startup recovery |
| `core.js` | Electron window lifecycle, persistence, local backups, notifications and cloud/update coordination |
| `preload.js` | Interface between the renderer and desktop operations |
| `index.html` | Board, calendar, project workspace and settings |
| `studio-data.js` | Studio schema, normalization and backup validation |
| `studio-model.js` | Shared invoice calculations, issued snapshots and revisions |
| `studio-workflow.js` | Workflow templates, scheduling and manual-date preservation |
| `studio-booking.js` | Booking stages, deposits and installments |
| `studio-search.js` | Project, client, invoice, document and task search |
| `studio-operations.js` | Availability, delivery, costs, duplication, drafts and client offers |
| `studio-client.js` | Desktop review and application of matching client responses |
| `studio-tools.js` | CSV portability, reminder selection, merge fields, setup sample and priority ordering |
| `cloud.js` | Google Drive backup and conflict handling |
| `updater.js` | Release checks, package download and checksum validation |
| `client-portal/` | Separate hosted Client Desk companion |

## Validate changes

Run the repository's behavior checks:

```sh
npm test
```

GitHub runs them on macOS, Windows and Linux for pushes to `main`, pull requests and installer builds. Coverage includes invoice consistency, scheduling, backup round trips, save failures, cloud conflicts, update recovery, import validation, reminders, priority ordering and Client Desk access behavior.

Before distributing installers, also check the desktop behavior on macOS and Windows: bubble positioning, system shortcuts, settings, invoice printing, imports, backup restoration and updating from a previous release. Automated checks support these checks rather than replacing them.

## Build and publish installers

Use **Actions → Build installers → Run workflow** in GitHub. Select the intended branch and leave **Sign installers** enabled for a signed build. Configure the credentials in [Signing setup](signing.md) first.

The workflow tests the app, builds macOS and Windows installers, then publishes a release. Both platform builds must pass. The release tag points to the commit selected for that run. Versions use `0.1.<workflow run number>`; the workflow sets the package version during the build, so the version in the source manifest is not the published installer version.

The release includes Apple Silicon and Intel disk images, the Windows installer, `app-update.asar` and `update.json` for the app's small-update path.

An explicit unsigned development-build option is available in the workflow. It still publishes release artifacts; choose it only when unsigned distribution is intended.

To build locally without publishing:

```sh
# On macOS
npm run dist:mac

# On Windows
npm run dist:win
```

Outputs are written to `dist/`. These local packaging commands do not invoke the additional verification in `scripts/build-signed.cjs`; configure and verify signing separately when distributing them.

## Keep packaging consistent

The desktop installer and small-update package must include every runtime module. Update both the `build.files` list in `package.json` and the copy list in `.github/workflows/build.yml` when adding one. The workflow pins the ASAR packer version.

A small update replaces the app core while retaining the installed launcher. Changes to `main.js` require a full installer. Keep the update manifest's shell compatibility value aligned with the launcher API the core requires.

## Configure Google Drive backup

Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as repository Actions secrets. The build writes `cloud-config.js` into its output. Do not commit that generated configuration or user tokens.

These Google application credentials are embedded in the distributed desktop build; repository secret storage protects the build inputs, not their recoverability from a desktop installation. The cloud implementation uses the Drive application-data scope. It does not provide end-to-end encryption of studio backups.

## Persistence and recovery

Normal saves retain device preferences. Transferable backups omit them. Restores validate the incoming studio and preserve the existing saved file before replacement. Save revisions and renderer guards reject stale restore attempts.

Cloud backup presents conflicting copies for a deliberate choice. It does not perform project-level merges. Keep that distinction explicit in interfaces and documentation when changing synchronization behavior.

Client Desk has its own hosting configuration, database migration and deployment lifecycle. Its [README](../client-portal/README.md) documents that boundary.
