# Signing and verifying installers

I added a signed-build path to give StudioAid a verifiable distribution identity and make installation more straightforward. The workflow handles packaging and verification; the signing certificates and account credentials must be supplied separately.

A configured workflow is not evidence that a particular release was signed. Publish a release as signed only after its certificate-backed build and verification steps have succeeded.

[Development and releases](development.md) · [User guide](user-guide.md)

## Configure repository credentials

In GitHub, open **Settings → Secrets and variables → Actions** for the repository and add:

| Secret | Purpose |
| --- | --- |
| `MAC_CSC_LINK` | Base64 content of the Developer ID Application `.p12` certificate, including its private key |
| `MAC_CSC_KEY_PASSWORD` | Password for the macOS certificate |
| `APPLE_ID` | Apple developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple app-specific password used for notarization |
| `APPLE_TEAM_ID` | Apple developer team ID |
| `WIN_CSC_LINK` | Windows code-signing `.pfx` certificate, including its private key, in a format supported by electron-builder |
| `WIN_CSC_KEY_PASSWORD` | Password for the Windows certificate |

Keep certificates, private keys and passwords out of source control and documentation. The build reads these values from its environment; they are not embedded in the app's source. Google sign-in credentials use their separate existing configuration.

This build path expects exportable certificates. A hardware-backed Windows certificate requires an appropriate signing-service integration instead.

## Run a signed build

1. Open **Actions → Build installers → Run workflow**.
2. Select the intended branch and leave **Sign installers** enabled.
3. Wait for behavior tests, both installer builds and the release job to succeed.
4. Check the resulting artifacts and release information before distribution.

Missing credentials stop the signed build before packaging. The macOS build enables the hardened runtime and notarization, then verifies both app bundles' signatures and stapled tickets. The Windows build verifies Authenticode signatures on the app executable and installer.

The workflow's explicit unsigned option remains available for development distribution. Unchecking **Sign installers** still produces release artifacts; it is not a local-only build.

## Understand the update boundary

Installer signing and the small-update mechanism are separate. Small updates use HTTPS and a SHA-256 checksum from the release manifest. They are not digitally signed by this installer-signing configuration.

The launcher retains startup-recovery behavior for failed updates. Changes to that launcher require a full installer, as described in [Development and releases](development.md).

## References

- [electron-builder code signing](https://www.electron.build/docs/features/code-signing/)
- [macOS notarization](https://www.electron.build/docs/features/code-signing/notarization/)

The repository's build configuration and `scripts/build-signed.cjs` define the options used by StudioAid; newer upstream documentation may describe additional tooling or different defaults.
