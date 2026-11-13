# App Review — «أي خدمة | aykdmh» (AYK-205)

Rejection 2026-11-02: **Guideline 2.1 – Information Needed** (2.1.0 App Completeness). Apple asks for six items in the
**Notes** of App Review Information, and a screen recording on a physical iPhone. No passwords here: the repository is public.

## Review accounts (done 2026-11-11)

The owner created `apple_review_client` (requester) and `apple_review_provider` (provider) in the admin area with one
password of their choice; `server/scripts/review-accounts.js --seed-only` then gave them a shared request (15) and a
chat (9), and paused the provider so real customers never see it. To refresh the sample data later:
`docker exec aykdmh-app node server/scripts/review-accounts.js --seed-only` (no password asked or changed).

## Notes — paste into App Store Connect → the version → App Review Information → Notes

```
1) SCREEN RECORDING
Attached: recorded on a physical iPhone with the latest iOS. It starts by launching the app and shows browsing as a
guest, account registration, login, a service request, the chat (including Block and Report), a voice call, and
account deletion.

2) PURPOSE AND AUDIENCE
Ay Khidmah (aykdmh) is a local services marketplace for Saudi Arabia. People who need a home or local service
(plumbing, electrical, cleaning, moving, maintenance…) post a request; nearby independent service providers
contact them in the app by chat or call and agree directly. It solves the problem of finding a trusted, nearby
provider quickly. One app serves both sides; the role comes from the account.

3) HOW TO ACCESS THE MAIN FEATURES
Two demo accounts (password sign-in, no SMS code):
- Service requester: apple_review_client — password in the Password field above.
- Service provider: apple_review_provider — the same password.
Sign in (Profile → Sign in) as the requester: Home shows the request "Sample request: electrical repair". Open it,
then open the chat with the provider. The phone and video buttons start a call (a call needs the other account on
a second device). Sign out and sign in as the provider to see the same request and chat from the other side.
Without an account you can browse the home page, services and providers.
User-generated content safety: in a chat, the ⋮ menu has Block user; Help/Support lets users report a person,
message or request; reviews and calls have a Report button. Reports are reviewed by our team within 24 hours, and
the admin area can hide content and block accounts.
Account deletion: Profile → Delete account (also https://aykdmh.com/delete-account).

4) EXTERNAL SERVICES
- Self-hosted LiveKit (WebRTC) on our own server: voice and video calls.
- Apple Push Notification service: notifications.
- OpenStreetMap map tiles and Nominatim: maps and addresses.
- ip-api.com: approximate city to show nearby content when location is not shared.
- Microsoft Translator (fallback MyMemory): optional translation of chat messages.
- A Saudi SMS gateway: phone verification codes at registration.
No payment processor and no AI services are used by the app.

5) REGIONAL DIFFERENCES
The app works the same in all regions. Service providers are currently in Saudi Arabia. The interface is
available in Arabic and 10 other languages.

6) REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not applicable: the app is not in a regulated industry and contains no protected third-party content. Services are
performed in person and paid directly between the two people, outside the app; there is no paid digital content
and no in-app purchase.
```

## Screen recording (owner, on an iPhone)

Install the latest TestFlight build, turn on Screen Recording in Control Center, then in one recording:
launch the app → browse as a guest → register a new throwaway account → sign out → sign in as
`apple_review_client` → open the request and the chat → show ⋮ (Block) and Help/Support (report) → start a call →
Profile → Delete account on the throwaway account (never on the review accounts).
Attach it under App Review Information (Attachment), then reply in the message thread and press **Resubmit to App Review**.
