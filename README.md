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

In the web version (or another computer), open Settings, press "Copy backup". In this app open Settings, paste into the box and press "Restore from box". Use the same steps to move data between your Mac and Windows computers.

## Where your data lives

- Mac: ~/Library/Application Support/StudioAid/data.json
- Windows: %APPDATA%\StudioAid\data.json

A daily copy is kept in the `backups` folder next to it (the last 14 days). "Show data folder" in the menu opens it.

## Get a normal installer (no Terminal needed)

This folder includes a ready-made GitHub recipe that builds the Mac installer (.dmg) and the Windows installer (.exe) for you in the cloud, for free.

1. Create a free account at https://github.com and make a new **private** repository.
2. Upload everything in this folder to it. If the hidden `.github` folder does not upload, click "Add file", then "Create new file", type `.github/workflows/build.yml` as the name, and paste in the contents of that file.
3. In the repository, open the **Actions** tab, choose "Build installers", and press "Run workflow".
4. After a few minutes, open the finished run and download the two files under Artifacts: one contains the .dmg (Mac), the other the .exe (Windows).

## Which file do I download?

- **Windows:** `StudioAid-Setup-<version>.exe`
- **Mac with an Apple chip (M1, M2, M3 and later):** `StudioAid-<version>-mac-arm64.dmg`
- **Mac with an Intel chip:** `StudioAid-<version>-mac-x64.dmg`

Not sure which Mac you have? Click the Apple menu, then About This Mac. If it says Chip, it is Apple; if it says Processor, it is Intel. The app's own "Check for updates" picks the right file for you.

## Building on your own computer instead

- On a Mac: `npm run dist:mac` makes one .dmg that works on both Apple Silicon and Intel Macs, in the `dist` folder.
- On Windows: `npm run dist:win` makes an installer in the `dist` folder.

## Opening the app the first time

The installers are not signed with a paid developer certificate, so the computer will warn you once.

- **Mac:** Open the .dmg and drag StudioAid into Applications. Double-click it. If macOS says it cannot verify the app, open System Settings, then Privacy & Security, scroll down, and press "Open Anyway" next to StudioAid. On older macOS you can instead right-click the app and choose Open. If macOS says the app is "damaged", run this once in Terminal: `xattr -cr "/Applications/StudioAid.app"`
- **Windows:** If SmartScreen warns about an unknown publisher, choose "More info", then "Run anyway".

Removing these warnings entirely requires paid developer accounts (Apple Developer Program for Mac, a code-signing certificate for Windows).

## Updates

Open Settings, then Updates, and press Check for updates. Most updates are small (about 0.1 MB): the app downloads only the changed program files, checks them against a fingerprint, and restarts. You do not reinstall anything. A full installer is only needed now and then, when the app's engine itself changes; the app tells you when. If a small update ever fails to start, the app switches back to the installed version by itself.

## Cloud backup (Google Drive)

Settings, then Cloud backup, then Sign in with Google. Your browser opens, you approve, and StudioAid keeps a private backup in a hidden app folder of your own Google Drive. Only StudioAid can see it, and your other Drive files are not touched. After that it backs up automatically a few seconds after you change something. On a new computer, sign in and your data is fetched. If two computers have different data, the app asks which to keep before anything is overwritten, and it keeps a safety copy of the local data first.

Maintainers: the Google client ID and secret are not stored in the repository. Add them as repository secrets named GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (Settings, Secrets and variables, Actions) and the build writes them into the app.

## Dock and Force Quit (Mac)

By default StudioAid shows in the Dock, so it appears in the Force Quit window (Command+Option+Esc). If you prefer a menu-bar-only app that can float over full-screen apps, turn off "Show in the Dock and Force Quit list" in Settings. The menu bar icon always has Quit.

## Notes

- The bubble lives on your main screen only.
- You will be asked once to allow notifications. You get one a day when steps are due or overdue.
- Email and WhatsApp buttons open your default mail app and browser.
- The two computers do not sync automatically yet. Use Copy backup and Restore to move data.
