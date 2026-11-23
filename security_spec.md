# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`allow read, write: if false;`).
2. **Authentication & Verified Email**: All client-side Firestore reads and writes require `isSignedIn()` and `request.auth.token.email_verified == true`.
3. **Path Variable Hardening**: Every single-document ID (`{santriId}`, `{soalId}`, `{snapshotId}`, `{adminId}`) is validated with `isValidId(id)` (`id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Identity & Ownership Integrity**:
   - `SantriRecord` and `SoalCBTRecord` require `authorUid == request.auth.uid` on creation and immutability of `authorUid` on update.
   - `SnapshotPesantren` requires `ownerId == request.auth.uid` and `snapshotId == request.auth.uid`.
   - Bootstrapped Admin (`musanashir@gmail.com` with verified email or `/admins/{uid}`) has administrative privileges.
5. **Strict Schema, URL Safety & Volumetric Bounds**: All fields are checked with `hasAll`, `hasOnly`, explicit type checks, document-ID binding (`incoming().idSoal == soalId`, `incoming().nis == santriId`), safe image URL scheme (`https://` or `data:image/*;base64,`), and `.size()` limits matching `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null` attempting `create` on `/santri/DF-202601` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email: 'musanashir@gmail.com', email_verified: false } }` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection (Create)**: Adding `"isSuperAdmin": true` to `/santri/DF-202601` -> rejected by `hasOnly()`.
4. **Shadow Field Injection (Update)**: Modifying an unlisted field on `/soal_cbt/SOAL-001` -> rejected by `affectedKeys().hasOnly()`.
5. **Identity Spoofing on Create**: Setting `authorUid: "other-user"` when `request.auth.uid == "attacker"` -> `PERMISSION_DENIED`.
6. **Owner Mutation on Update**: Changing `authorUid` or `ownerId` during `update` -> `PERMISSION_DENIED`.
7. **ID Poisoning**: Creating document with 500-char or special-char ID -> rejected by `isValidId()`.
8. **Denial-of-Wallet Oversized String**: Sending 1MB `pertanyaan` string in `/soal_cbt/SOAL-001` -> rejected by `pertanyaan.size() <= 2000`.
9. **Invalid Enum Value**: Setting `kunciJawaban: "E"` or `unit: "InvalidUnit"` -> `PERMISSION_DENIED`.
10. **Blanket List Scraping**: Listing `/santri` or `/pesantren_snapshots` without filtering by `authorUid == request.auth.uid` or `ownerId == request.auth.uid` -> `PERMISSION_DENIED`.
11. **Value Poisoning on Update**: Updating `bobotSoal` with a string instead of a number -> rejected by `isValidSoalCBT(incoming())`.
12. **Privilege Escalation via `/admins`**: Non-admin user attempting to write `/admins/{uid}` -> `PERMISSION_DENIED`.
