# Firestore Security Rules Specification

## 1. Data Invariants
- A `UserProfile` document at `/users/{userId}` can only be read or created/updated by `request.auth.uid == userId`, and `uid` inside the payload must strictly match `request.auth.uid`.
- No PII (email, phone, password, password hash) is ever stored in `/users/{userId}` or `/usernames/{usernameLower}`.
- Usernames must match `^[a-zA-Z0-9_]{3,20}$` (`usernameLower` must match `^[a-z0-9_]{3,20}$`).
- Creation of `/users/{userId}` and `/usernames/{usernameLower}` must happen atomically in the same batch (`existsAfter` cross-check), preventing orphaned reservations or duplicate usernames.
- `createdAt` and `updatedAt` must always equal `request.time`, and `createdAt`, `uid`, `username`, and `usernameLower` are immutable on profile updates.
- `list` queries on `/users` and `/usernames` are explicitly denied (`allow list: if false`) to prevent scraping all accounts.

## 2. Dirty Dozen Adversarial Payloads
1. Unauthenticated create on `/users/u1` -> `PERMISSION_DENIED`
2. Authenticated `u1` creating `/users/u2` (UID mismatch on path) -> `PERMISSION_DENIED`
3. Authenticated `u1` creating `/users/u1` with `uid: "u2"` (Identity Spoofing) -> `PERMISSION_DENIED`
4. Shadow field injection `{ ..., isAdmin: true }` on `/users/u1` -> `PERMISSION_DENIED`
5. Oversized ID `/users/${"a".repeat(300)}` -> `PERMISSION_DENIED`
6. Invalid username `"x"` (too short) or `"bad name!"` (invalid chars) -> `PERMISSION_DENIED`
7. Client-forged `createdAt` or `updatedAt` not equal to `request.time` -> `PERMISSION_DENIED`
8. Non-atomic `/usernames/hero1` create without matching `/users/{uid}` in same batch -> `PERMISSION_DENIED`
9. Negative `wins: -5` or non-integer `wins: 1.5` -> `PERMISSION_DENIED`
10. Profile update attempting to mutate `uid`, `username`, or `createdAt` -> `PERMISSION_DENIED`
11. Listing `/users` or `/usernames` collection to scrape accounts -> `PERMISSION_DENIED`
12. Deleting another user's `/usernames/{name}` reservation -> `PERMISSION_DENIED`
