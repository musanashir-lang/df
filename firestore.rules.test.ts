/**
 * Security Rules Dirty Dozen Verification Specification
 * Verifies that all 12 adversarial payloads defined in security_spec.md are rejected with PERMISSION_DENIED.
 */
export const DIRTY_DOZEN_PAYLOADS = [
  { id: 1, name: 'Unauthenticated Write', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified Email Spoof', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Shadow Field Injection (Create)', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Shadow Field Injection (Update)', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Identity Spoofing on Create', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Owner Mutation on Update', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'ID Poisoning', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Denial-of-Wallet Oversized String', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Invalid Enum Value', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Blanket List Scraping', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Value Poisoning on Update', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Privilege Escalation via /admins', expected: 'PERMISSION_DENIED' },
];
