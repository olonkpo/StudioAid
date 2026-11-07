# StudioAid Client Desk

A hosted companion to the StudioAid desktop app. Each signed-in studio operator uploads a client offer exported by StudioAid, creates an expiring invitation link, and downloads the client's recorded response for review/import into the original desktop project.

## Access and data

The current Site remains owner-private pending explicit approval for public client access. The platform sign-in gate therefore blocks external clients even if they have an invitation link. The Site must allow external visitors for client invitations to work; application-level admin ownership and invitation-token checks remain required after that change. The public page does not expose a directory of offers. An invitation uses a 256-bit random token in the URL fragment and sends it to the API through an Authorization header. The database stores a SHA-256 token hash, never the original token. Keep invitation links between the studio and intended client.

Administration requires Sign in with ChatGPT. Every admin query includes the authenticated Site user ID; one signed-in studio cannot list, export, replace or revoke another studio's offers. Sign-in identifies the operator and does not automatically import their desktop data.

Client access needs the invitation link. It expires at the exported offer expiry and can be revoked. A client can submit one response; identical retries with the same submission ID are safe. New details after submission require contacting the photographer or issuing a fresh offer. Revoking an invitation preserves its response for the operator's export.

A quote response is a recorded approval/decline/detail submission. This application does not take payments, confirm bookings automatically, or provide electronic contract signatures.

## Storage and migration

The Worker uses the `DB` D1 binding declared in `.openai/hosting.json`. The schema-only migration is `drizzle/0000_client_offers.sql` with its Drizzle migration journal. Sites packaging copies these migrations to `dist/.openai/drizzle` and applies them before deploying the Worker. No table creation occurs during requests.

## Build and verification

No package installation is needed.

- `npm test`: auth scoping, token expiration/revocation, schema validation, idempotent responses and request limits using a D1 test double.
- `npm run build`: produces the Worker artifact with the hosting manifest and migrations.
- `npm run validate`: confirms the artifact is an ESM Worker.

Keep source edits in `worker/index.js`; the starter build copies only that file, its manifest and the migration directory. Essential brand image bytes are embedded; there are no third-party browser scripts or tracking images.

## End-to-end use

1. In StudioAid, export a client offer for the project and open Client Desk.
2. Sign in with ChatGPT, upload the exported offer and generate its invitation.
3. Copy the invitation link to the intended client. A replacement link invalidates the old one; an answered offer cannot be reopened by rotating its token.
4. The client reviews their quote, enters shoot details and records approve, decline or details-only.
5. Download the response from the offer list. Import it into StudioAid to review and apply the client's details to the matching project.
