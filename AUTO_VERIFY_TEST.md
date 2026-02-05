# Auto-Verify Implementation Test

## Testing the Feature

To test the automatic proof verification feature:

1. **Export a proof from the app:**
   - Complete a before-after photo session
   - Go to the Proofs tab
   - Export any proof as JSON

2. **Test file import:**
   - Share the JSON file to another device or the same device
   - Tap on the JSON file and choose "Open with BeforeAfter"
   - The app should automatically open and navigate to the verification screen
   - Within 1-2 seconds, you should see either "VALID ✅" or "TAMPERED ❌"

3. **Expected behavior:**
   - No buttons need to be pressed after opening the file
   - The verification happens automatically
   - Valid proofs show green checkmark with details
   - Tampered proofs show red X with specific failure reasons

## Implementation Summary

✅ **Import Listener Hook** (`hooks/use-imported-proof.ts`)
- Detects when app is opened via file association
- Parses JSON and validates it's a BeforeAfter proof using the actual exported structure
- Validates required fields: `proof.verificationCode`, `proof.before.imageHash`, `proof.after.imageHash`
- Returns proof object or null

✅ **Auto-Verify Screen** (`app/auto-verify.tsx`)
- Three states: Loading, Valid, Tampered
- Runs all 7 verification checks instantly on mount
- Shows clear visual feedback with proof details from actual JSON structure
- Matches existing app visual style

✅ **Root Layout Integration** (`app/_layout.tsx`)
- Added hook to listen for imported proofs
- Auto-navigates to verification screen when proof detected
- Added screen to Stack navigator

## The 7 Verification Checks

The system performs exactly these 7 checks against the real exported JSON structure:

### Check 1 — Before image hash integrity
- **Validation:** `proof.before.imageHash` must equal `proof.before.integrity.hashSignature`
- **Failure:** Before image was tampered

### Check 2 — After image hash integrity  
- **Validation:** `proof.after.imageHash` must equal `proof.after.integrity.hashSignature`
- **Failure:** After image was tampered

### Check 3 — Time sequence is valid
- **Validation:** `proof.after.timestamp` must be AFTER `proof.before.timestamp` AND `proof.verification.timeSequence.chronologicallyValid` must be true
- **Failure:** Time sequence invalid

### Check 4 — Time window respected
- **Validation:** `proof.timeWindow.withinWindow` must be true AND `actualDurationMinutes` must be between `declaredMinMinutes` and `declaredMaxMinutes`
- **Failure:** Time window violation

### Check 5 — Session integrity
- **Validation:** `proof.verification.sessionIntegrity.sameSession` must be true
- **Failure:** Photos from different sessions

### Check 6 — Audit trail continuity
- **Validation:** Audit trail must contain: `time_window_declared`, `before_capture`, `proof_created` events in chronological order with consistent `sessionId`
- **Failure:** Audit trail issues

### Check 7 — Verification code format
- **Validation:** `proof.verificationCode` must start with "BA-2026-" and have 6 characters after (total 14 chars)
- **Failure:** Verification code format invalid

## Display Fields for Valid Proofs

When ALL checks pass, the screen displays:

- **Verification Code:** `proof.verificationCode`
- **Before Timestamp:** `proof.before.timestamp` (formatted)
- **After Timestamp:** `proof.after.timestamp` (formatted)  
- **Before Location:** `proof.before.location.latitude, longitude`
- **After Location:** `proof.after.location.latitude, longitude`
- **Device:** `auditTrail[0].metadata.device`
- **Platform:** `auditTrail[0].metadata.platform`
- **Session ID:** `proof.verification.sessionIntegrity.sessionId`
- **Time Window:** `actualDurationMinutes min (declared: min–max min)`
- **Trust Score:** `platformMetadata.trustScore.total out of 100`
- **TSA Data:** If `externalAnchor` exists, shows serial and anchored timestamp

## Display Fields for Tampered Proofs

When ANY check fails, the screen displays:

- **Failed Checks:** List of which specific checks failed and why
- **Passed Checks:** List of which checks still passed (if any)

## Key Features

- **Zero-button interaction:** File opens → verification shows automatically
- **Complete verification:** All 7 checks run against real exported JSON structure  
- **Clear visual feedback:** Large ✅ VALID or ❌ TAMPERED indicators
- **Detailed information:** Shows all relevant proof details from actual structure
- **TSA support:** Displays timestamp anchor data if present
- **Error handling:** Graceful handling of invalid files and parsing errors

## Expected Result

Person A exports JSON proof from BeforeAfter → Sends to Person B → Person B taps file → BeforeAfter opens → Runs all 7 checks instantly → Shows VALID ✅ or TAMPERED ❌ within one second → Person B pressed zero buttons after tapping the file.
