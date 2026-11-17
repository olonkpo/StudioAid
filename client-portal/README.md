# StudioAid Client Desk

I built Client Desk to connect a studio's prepared quote with a structured client response. The desktop app keeps the project record; the hosted companion presents the offer and collects the details needed for the next step.

This addresses a practical gap: a quote can be prepared in one place while approval, contact updates and shoot preferences arrive in separate messages. Client Desk brings those responses together in a file the studio can review before updating the original project.

[StudioAid overview](../README.md) · [Desktop user guide](../docs/user-guide.md)

## Current availability

[Client Desk](https://studioaid-client-desk.pebblyowlet8.chatgpt.site) is deployed as an access-restricted preview. The hosting platform's audience controls apply before the application's invitation checks. A client invitation does not bypass those controls; the intended visitor must also be allowed by the platform's access policy.

The companion has a separate release and deployment lifecycle from the desktop app. Changes in this GitHub directory do not by themselves update the hosted application.

## What I designed it to do

- Present the studio's branding, client details, shoot information, quote lines and payment requirements.
- Let a client approve, decline or send details without approving yet.
- Collect contact information, location, a shoot brief and photography preferences.
- Return a recorded response for explicit review in the matching desktop project.
- Keep studio administration separate from client invitation access.

A response records the client's decision. It does not process a payment, confirm the booking automatically or provide an electronic contract signature.

## Offer and response workflow

1. In the desktop project's **Client page**, choose **Export client offer**.
2. Open Client Desk, sign in with ChatGPT and upload the exported offer.
3. Generate an invitation and copy its link for the intended client, subject to the preview's platform access policy.
4. The client reviews the quote, enters details and submits a response.
5. Download the recorded response from the studio's invitation list.
6. Import it into the original desktop project, review the proposed details and choose **Apply reviewed response**.

The desktop app checks that the response matches the latest offer and that the project and quote still match the exported terms. Changed terms require a fresh offer. Applying a response updates supplied client/shoot details and records the decision; prices and booking stage remain under the studio's control.

There is no automatic upload or synchronization of the complete desktop studio. Internal costs, message drafts and private project notes are not part of the offer export.

## Access and invitation handling

Studio administration requires ChatGPT sign-in. Administrative database operations are scoped to the authenticated operator, so one operator cannot list, export, replace or revoke another operator's offers.

Each invitation uses a random 256-bit token. The browser receives it in the URL fragment and sends it to the API in an Authorization header. The database stores a SHA-256 hash of the token rather than the token itself. Treat the complete invitation link as access to that offer and share it only with the intended recipient.

Invitations expire with their exported offer and can be revoked. Replacing an unanswered invitation invalidates its previous link. An answered offer cannot be reopened by rotating its token.

A client can submit one response. Identical retries using the same submission ID are idempotent; changed details after submission require contacting the studio or preparing a fresh offer. Revocation blocks client access while retaining the response for the studio's export.

## Storage and deployment

The Worker uses the `DB` D1 binding declared in `.openai/hosting.json`. The schema migration is `drizzle/0000_client_offers.sql`, accompanied by its migration journal.

The build copies the Worker, hosting manifest and migrations into `dist/`. Deployment packaging places migrations under `dist/.openai/drizzle` so they can be applied before the Worker is deployed. Requests do not create database tables.

Keep application edits in `worker/index.js`. The page embeds its brand image and does not load third-party browser scripts or tracking images. Responses use no-store headers, and the HTML applies a nonce-based content security policy.

## Build and validate

From `client-portal/`, run:

```sh
npm test
npm run build
npm run validate
```

No package installation is required for these commands. Tests cover offer validation, operator ownership, token handling, expiry, revocation, response retries and request limits using a D1 test double. Artifact validation checks the Worker export and hosting manifest.

Before changing the hosted version, also verify the complete handoff: desktop export, offer upload, invitation access under the selected audience policy, client submission, response download and desktop review/import.
