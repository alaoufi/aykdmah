# App Review — «أي خدمة | aykdmh» (AYK-201)

Rejection 2026-11-02: **Guideline 2.1 – Information Needed** (2.1.0 App Completeness). The usual cause is that the
reviewer cannot sign in or cannot try both sides of the app. This file is what to put in App Store Connect.
No passwords here: the repository is public.

## 1) Prepare the two review accounts (server, once)

```bash
docker exec -it aykdmh-app node server/scripts/review-accounts.js
```

It asks for one password (8+ characters, typed twice, not shown) and creates or refreshes:

| Username | Role | Sample data |
|---|---|---|
| `apple_review_client` | Service requester | One request «electrical repair», assigned to the provider below, with a chat |
| `apple_review_provider` | Service provider | The same request and chat; paused, so real customers are never matched with it |

Sign-in is username + password (no SMS code). Running it again only changes the password.

## 2) App Store Connect → the version → App Review Information

- **Sign-in required:** on.
- **User name:** `apple_review_client` · **Password:** the one typed in step 1.
- **Notes** (paste as is, then add the provider password line):

```
Ay Khidmah connects people who need a local service (plumbing, electrical, cleaning, moving…) with nearby
service providers in Saudi Arabia. One app serves both sides; the role comes from the account.

TEST ACCOUNTS (password sign-in, no SMS code):
1) Service requester: apple_review_client (password in the fields above)
2) Service provider:  apple_review_provider (same password)

HOW TO TEST
- Sign in as the requester: Home shows your request "Sample request: electrical repair". Open it, then
  "Chats" to message the provider. The phone and video buttons in the chat start a call.
- Sign out (Profile → Sign out) and sign in as the provider to see the same request and chat from the
  other side; reply or call back. A call between the two accounts needs two devices.
- You can also browse without an account: the home page, services and providers are public.

PERMISSIONS
- Camera and microphone: only for voice/video calls in a chat, asked when a call starts.
- Location: to show requests and providers near the user; the app works without it.
- Notifications: incoming calls and messages.

PAYMENTS
The service is performed in person and paid directly between the two people, outside the app. The app sells
no digital content and has no in-app purchases.

ACCOUNT DELETION
Profile → Delete account, or https://aykdmh.com/delete-account
Privacy policy: https://aykdmh.com/privacy
```

- **Contact information:** the owner's name, phone and email (already filled).
- **Attachment (recommended):** a 1–2 minute screen recording from an iPhone: sign in as the requester,
  open the request and the chat, start a call; then the provider side.

## 3) Reply and resubmit

In the rejection message thread, reply that the test accounts and notes are now in App Review Information,
answer Apple's questions one by one, then press **Resubmit to App Review**.
