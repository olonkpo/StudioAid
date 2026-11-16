# Signed StudioAid installers

The **Build installers** workflow defaults to signed builds. Signing is not complete until you add your certificates and run the workflow successfully. Never paste certificates, private keys or passwords into chat or commit them to the repository.

In GitHub → repository Settings → Secrets and variables → Actions, add:

| Secret | Value |
| --- | --- |
| MAC_CSC_LINK | Base64 content of your Developer ID Application `.p12` certificate, including its private key |
| MAC_CSC_KEY_PASSWORD | Password for that certificate |
| APPLE_ID | Apple developer account email |
| APPLE_APP_SPECIFIC_PASSWORD | Apple app-specific password for notarization |
| APPLE_TEAM_ID | Apple developer team ID |
| WIN_CSC_LINK | Windows code-signing `.pfx` certificate including its private key, in the format accepted by electron-builder |
| WIN_CSC_KEY_PASSWORD | Password for that certificate |

This configuration uses exportable certificates. A hardware-backed Windows certificate needs a signing-service integration instead; do not export a key that your provider does not allow to be exported.

Run **Actions → Build installers → Run workflow**, leaving **Sign installers** checked. Missing credentials stop the build before packaging. Both platforms must pass before a release is published. macOS builds use the hardened runtime and notarization; the script verifies each app signature and stapled ticket. Windows verifies the installer and app Authenticode signatures.

For an explicitly unsigned development build, uncheck **Sign installers**. That option still creates a release with unsigned installers, so use it only when that is the intended distribution. Installer signing does not add a digital signature to the existing small-update protocol: that protocol continues to use HTTPS and the release manifest's SHA-256 checksum, with startup rollback.

Keep Google sign-in credentials in their existing secrets. Signing credentials are read only by the build jobs and are never embedded in app source.

References: [electron-builder code signing](https://www.electron.build/docs/features/code-signing/), [macOS notarization](https://www.electron.build/docs/features/code-signing/notarization/).
