# Privacy Policy

_Last updated: May 11, 2026_

## Overview

Kurator ("the app") is a collection tracker owned and operated by [Boxing Octopus Creative](https://boxingoctop.us).

This policy describes what the software can store and transmit when you use an instance operated by you, your organization, or a host. Not every deployment turns on optional integrations. Contact whoever runs your server if you need their exact configuration.

## Information you provide

- **Account data:** email address and a password stored as a hash (not plaintext). Optional two-factor authentication: when you enable it, data needed to verify your authenticator codes is stored with your account. If the operator uses invite-only signup, a short-lived cookie may confirm you opened an approved beta registration link until you finish registering.

- **Profile information:** username (used in public URLs unless the profile is private), optional legal first and last names with separate "show on profile" controls, display name, bio, avatar and banner images, location, theme (light / dark / system), colour scheme and font preferences, toggles that unlock accessibility palettes or fonts, social links you add, whether your overall profile is discoverable, and per-shelf visibility you choose (private, visible to followers, or to mutual connections where the product supports it).

- **Shelf and item content:** collection and list titles, descriptions, category pins, cover art, ratings, consumption status where used, structured metadata you enter or import (for example identifiers or fields that vary by category), wishlists, and free-form notes you attach to entries.

- **Social and activity:** who you follow and who follows you; optional in-app activity notifications describing actions by other users relevant to your content. When you are signed in, the People area may list mutual followers and suggest other accounts with public profiles who are followed by those mutual connections (excluding people you already follow).

## Automatically collected data and device storage

- **Cookies:** a session cookie is used so you stay signed in. A separate short-lived cookie may apply during invite-only registration, as noted above.

- **Server logs:** whoever hosts the site will typically retain routine request metadata (such as timestamps, approximate network location from IP addresses, and paths requested) consistent with normal web operations.

- **Browser storage:** the site may save small preferences on your device, such as how you like a shelf to display or cached imagery, to improve responsiveness. You can clear this data from your browser settings.

- **Error monitoring and diagnostics (when enabled):** the operator may send crash reports, errors, or performance telemetry to help find and fix bugs. Those reports can include contextual details, sometimes including clues that relate to who you are or what you were doing when something went wrong. If replay-style diagnostics are enabled, snippets of how the interface behaved may also be captured for troubleshooting.

- **Experiment and rollout tooling (when enabled):** the operator may route part of traffic through a feature-flag or experimentation service so the app can turn capabilities on or off safely. Signed-in sessions may be identified in a stable way (for example with your account ID and email) so assignments stay consistent across visits. That vendor's policy governs processing on their side.

- **Abuse prevention (when enabled):** sensitive actions such as sign-in, signup, or password recovery may show a verification step provided by an external supplier; they process the signals needed to tell humans and scripted abuse apart under their own terms.

## How we use information

Information is used to run the service: sign-in and sessions, optional stronger sign-in safeguards, storing shelves and items, honouring visibility and follow rules, search when indexing is wired up, optional lookups when you request catalog-style metadata while adding or editing entries, emailed password reset when outbound mail is available, diagnostics when operators enable troubleshooting tooling, and the optional flows described elsewhere on this page.

## Where data lives and third parties

Accounts, shelves, items, follows, notifications, and similar application data ordinarily live in the database your operator maintains. Uploaded or linked images, including cover art, avatars, and stock photography used on marketing-style pages, may be stored alongside that deployment or fetched from URLs you or the design points at on other domains.

Operators may optionally connect supplementary services beyond their own servers, for example searchable indexes for faster lookups, transactional email used only to deliver password-reset messages, libraries and reference sites consulted when you run a catalog search, encyclopedic summaries, or the tooling described under "Automatically collected" above. Queries or identifiers exit your instance only when you take an action that clearly requests that kind of help (or when automatic enrichment is toggled on in line with operator policy). Third parties apply their own policies to anything they receive.

Ask whoever runs your instance which connections are enabled if you want a definitive list. This policy cannot enumerate every bespoke deployment choice.

## Your choices

You can update profile and collection data through the app where supported. To delete your account, use **Profile Settings → Delete your account** in the app: your account is deactivated immediately (hidden from others), you receive an email with a 30-day reactivation link, and permanent deletion runs after that grace period unless you reactivate. For self-hosted deployments without email configured, operators should document an equivalent process or use database administration.

## Changes

This policy may be updated from time to time. The "Last updated" date at the top will change when revisions are published.
