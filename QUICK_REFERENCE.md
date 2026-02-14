# Quick Reference: Client Verification Flow

## 🚀 Core Concept
**Worker signs proof cryptographically → Backend stores it → Client verifies signature locally with PIN**

---

## 🔑 Key Cryptographic Functions

### Worker Side
```typescript
// 1. Generate keys (once per device)
await generateWorkerKeypair();
// Stores in Expo Secure Store:
// - workerPrivateKey (secret! never leaves device)
// - workerPublicKey

// 2. Register public key with backend (first upload)
await registerPublicKey(workerId);
// POST /workers/:workerId/public-key

// 3. Sign and upload proof
const proofId = await uploadSignedProof(proof);
// Internally:
// - canonicalizeProof(proof) → deterministic JSON
// - sha256(canonical) → hash
// - sign(hash, privateKey) → signature (Base64)
// - POST /proofs with { proof, signature }

// 4. Generate PIN for client
const pin = await generatePin(proofId);
// POST /proofs/:proofId/pin → returns 10-char PIN
```

### Client Side
```typescript
// 1. Fetch proof + signature + public key
const { proof, signature, workerPublicKey } = await fetchProofByPin(pin);
// GET /verify/:pin

// 2. Verify signature (LOCALLY, never trust backend)
const isValid = await verifyProofSignature(proof, signature, workerPublicKey);
// Internally:
// - canonicalizeProof(proof) → SAME deterministic JSON
// - sha256(canonical) → SAME hash
// - verify(hash, signature, publicKey) → boolean

// 3. If valid: display read-only proof
// If invalid: show BIG RED ERROR, refuse to display
```

---

## 📊 State Flow

```
HOME SCREEN
    ↓
    ├─→ WORKER BUTTON → (tabs)/index.tsx → Capture → Sign → Upload → Show PIN
    │                                                              ↓
    │                                                          Backend Storage
    │
    └─→ CLIENT BUTTON → ClientVerifyScreen → Enter PIN → Verify Sig → Display
                                              ↓
                                        Backend Retrieval
```

---

## 🔐 Canonical Proof (CRITICAL)

Both worker and client must create **identical** JSON strings:

```javascript
{
  after: {
    gps: { lat: 40.7128, lon: -74.0060 },
    imageHash: "abc123...",
    timestamp: "2026-02-13T10:00:00Z"
  },
  before: {
    gps: { lat: 40.7128, lon: -74.0060 },
    imageHash: "def456...",
    timestamp: "2026-02-13T09:00:00Z"
  },
  createdAt: "2026-02-13T10:30:00Z",
  proofId: "PROOF-123",
  status: "completed",
  workerId: "WORKER-456"
}
```

**Fields are alphabetically sorted, no extra whitespace.** Any deviation = signature fails.

---

## 🔄 API Endpoints Used

| Endpoint | Method | Body | Response |
|----------|--------|------|----------|
| `/workers/:workerId/public-key` | POST | `{ publicKey }` | Success |
| `/proofs` | POST | `{ proof, signature }` | `{ proofId, ... }` |
| `/proofs/:proofId/pin` | POST | - | `{ pin: "ABC123XYZ0" }` |
| `/verify/:pin` | GET | - | `{ proof, signature, workerPublicKey }` |

---

## 🛡️ Security Principles

1. **Never expose private key** - Stored in Secure Store, never logged
2. **Sign deterministically** - Canonical JSON ensures reproducibility
3. **Verify client-side** - Backend is untrusted for verification
4. **Freeze in client mode** - `Object.freeze()` prevents tampering
5. **Rate limit attempts** - 5 tries, then 5-min lockout
6. **Clear sensitive data** - On screen exit, app background
7. **Use HTTPS in production** - Only localhost in dev

---

## ⚠️ If Signature Verification Fails

**Client sees:**
```
❌ CRITICAL: Proof has been tampered with - signature invalid
```

**This means:**
- Worker modified the proof after signing
- Network corruption (unlikely with modern networks)
- Client/worker canonical JSON differs (developer error)

**Response:** Refuse to display proof. Show red error.

---

## 📈 Integration Checklist

- [ ] Import `useWorkerSigning` in worker screen
- [ ] Call `generateWorkerKeypair()` on component mount
- [ ] Replace direct fetch with `uploadSignedProof(proof)`
- [ ] Call `generateSharingPin(proofId)` after upload
- [ ] Show PIN modal with copy/share buttons
- [ ] Test: Worker → PIN → Client → Verify

---

## 🐛 Common Issues

### "Invalid or expired code"
- PIN doesn't exist in backend
- PIN expired (backend-configured lifetime)
- User mistyped PIN

### "Proof has been tampered with"
- Worker modified proof after signing ❌
- Canonical JSON doesn't match between devices
- Sign field order wrong (should be alphabetical)

### "Locked for 5 minutes"
- User failed 5 verification attempts
- Check PIN with worker
- Check clock sync

---

## 💾 File Organization

```
app/
  config/
    api.ts                    # Endpoints + constants
  utils/
    crypto.ts                 # Sign/verify functions
    proofUpload.ts            # Upload + PIN functions
  screens/
    ClientVerifyScreen.tsx    # Client UI
  hooks/
    useWorkerSigning.ts       # Worker signing hook
  home.tsx                    # Role selection
  client-verify.tsx           # Route wrapper

components/
  ProofDisplay.tsx            # Proof display component

hooks/
  useWorkerSigning.ts         # (same as above, convenience)
```

---

## 🔍 Testing the System

**Manual Test:**
1. Worker app: Select "I'M A WORKER"
2. Capture before/after photos
3. Tap "Upload" button
4. See PIN: "ABC123XYZ0"
5. Share PIN to tester
6. Client app: Select "I'M A CLIENT"
7. Enter PIN: "ABC123XYZ0"
8. See: "✅ CRYPTOGRAPHICALLY VERIFIED"
9. See read-only proof

**Verify Tampering:**
1. Have worker modify proof data locally (hack code)
2. Sign and upload
3. Client tries to verify
4. Should show: "CRITICAL: Proof has been tampered with"

---

## 📞 Support

For issues:
1. Check console logs for crypto operations
2. Verify canonical JSON matches
3. Ensure backend endpoints are correct
4. Check clock sync between devices
5. Review INTEGRATION_GUIDE.md for detailed steps

