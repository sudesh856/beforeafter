# BeforeAfter App - UI/UX State Flow Diagram

## Overall App State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                          HOME/IDLE STATE                            │
│  • No active session                                                │
│  • No before photo taken                                            │
│  • activeSession = null                                             │
│  • beforeTaken = false                                              │
├─────────────────────────────────────────────────────────────────────┤
│ UI ELEMENTS VISIBLE:                                                │
│  ✓ \"Capture Before Photo\" button                                   │
│  ✓ Export button (IF hasExportData)                                 │
│  ✓ Tamper warning (IF tamperWarnings.length > 0)                    │
│  ✓ Job details form (optional)                                      │
│  ✗ Cancel Session button (HIDDEN)                                   │
│  ✗ Delete Before button (HIDDEN)                                    │
│  ✗ Take After Photo button (HIDDEN)                                 │
│  ✗ Cooldown timer (HIDDEN)                                          │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               │ User: Click \"Capture Before Photo\"
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CAPTURE BEFORE PHOTO STATE                       │
│  • Camera opens                                                     │
│  • Takes photo                                                      │
│  • Captures location (jobSiteLocation)                              │
│  • Captures timestamp                                               │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               │ Photo taken + session created
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  BEFORE PHOTO LOCKED STATE                          │
│  • activeSession created and set to isActive = true                 │
│  • beforeUri set                                                    │
│  • beforeTaken = true                                               │
│  • beforeLocation captured                                          │
│  • metadata captured                                                │
│  • mode = 'after'                                                   │
├─────────────────────────────────────────────────────────────────────┤
│ UI ELEMENTS VISIBLE:                                                │
│  ✓ \"Before locked ✅\" status message                               │
│  ✓ Location coordinates display                                     │
│  ✓ Session ID display                                               │
│  ✓ Cooldown timer message (IF remainingCooldownMs > 0)              │
│  ✓ \"Take After Photo\" button (DISABLED if cooldown active)         │
│  ✓ \"Cancel Session\" button                                         │
│  ✓ \"🗑️ Delete Before\" button                                       │
│  ✗ \"Capture Before Photo\" button (HIDDEN)                          │
│  ✗ Export button (HIDDEN - processing)                              │
│  ✗ Tamper warning (HIDDEN - session active)                         │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ├─────────────────────────────────────────┐
               │                                         │
               │ (< 60 seconds)                    (>= 60 seconds)
               │ Button disabled                    Button enabled
               │
               ▼                                        ▼
┌──────────────────────────┐         ┌──────────────────────────┐
│ COOLDOWN ACTIVE STATE    │         │ COOLDOWN EXPIRED STATE   │
│ remainingCooldownMs > 0  │         │ remainingCooldownMs = 0  │
├──────────────────────────┤         ├──────────────────────────┤
│ UI: Countdown timer      │         │ UI: No timer             │
│ \"Wait 45.2s...\"         │  ────►  │ \"Take AFTER photo\" ready│
│ \"After\" btn DISABLED    │         │ \"After\" btn ENABLED     │
└──────────────────────────┘         └──────────────┬───────────┘
                                                    │
                                  User: Click \"Take After Photo\"
                                                    │
                                                    ▼
                                    ┌──────────────────────────┐
                                    │ CAPTURE AFTER PHOTO      │
                                    │ • Camera opens           │
                                    │ • Takes photo            │
                                    │ • Captures location      │
                                    │ • Validates:             │
                                    │   - Time gap (1-24 hrs)  │
                                    │   - Distance (< 100m)    │
                                    │   - Photo integrity      │
                                    └──────────────┬───────────┘
                                                    │
                                                    ▼
                                    ┌──────────────────────────┐
                                    │ VALIDATE & SAVE PROOF    │
                                    │ • Create hashes          │
                                    │ • Generate ver. code     │
                                    │ • Log audit event        │
                                    │ • Save to AsyncStorage   │
                                    └──────────────┬───────────┘
                                                    │
                                                    ▼
                                    ┌──────────────────────────┐
                                    │ COMPLETE SESSION         │
                                    │ resetUIState() called:   │
                                    │ • Clear all state        │
                                    │ • Remove from storage    │
                                    │ • Reset mode to 'before' │
                                    │ • Refresh export data    │
                                    └──────────────┬───────────┘
                                                    │
                                                    ▼
                                                [BACK TO HOME/IDLE]
               │                                     ▲
               │                                     │
               │─────────────────────────────────────┘
               │                (or from COOLDOWN_ACTIVE
               │                 via Cancel/Delete buttons)
               │
               ├─── User: Click \"Cancel Session\" ───┐
               │                                      │
               │                                      ▼
               │                    ┌──────────────────────────┐
               │                    │ SESSION ABANDONED        │
               │                    │ • Log cancellation       │
               │                    │ • Log tamper event       │
               │                    │ • Call resetUIState()    │
               │                    └──────────────┬───────────┘
               │                                    │
               │                                    ▼
               │                               [BACK TO HOME/IDLE]
               │                                    ▲
               │                                    │
               │────────────────────────────────────┘
               │
               └─── User: Click \"🗑️ Delete Before\" ──┐
                                                     │
                                                     ▼
                                    ┌──────────────────────────┐
                                    │ DELETE BEFORE PHOTO      │
                                    │ • Log tamper event       │
                                    │ • Mark session TAMPERED  │
                                    │ • Call resetUIState()    │
                                    │ • Show warning alert     │
                                    └──────────────┬───────────┘
                                                    │
                                                    ▼
                                               [BACK TO HOME/IDLE]
                                                (WITH TAMPER WARNING)
```

---

## Export Button Visibility State

```
┌──────────────────────────────────────────────┐
│      Export Button Visibility Logic          │
├──────────────────────────────────────────────┤
│                                              │
│  hasExportData = await checkExportData()    │
│                                              │
│  Checks AsyncStorage for:                   │
│  ├─ 'proofs'           → true if exists     │
│  ├─ 'auditTrail'       → true if exists     │
│  ├─ 'tamperWarnings'   → true if exists     │
│                                              │
│  hasExportData = (proofs OR auditTrail      │
│                   OR tamperWarnings)        │
│                                              │
│  RENDER: {hasExportData && <Button />}      │
│                                              │
└──────────────────────────────────────────────┘

┌─────────────────────┬──────────────┬────────────────┐
│  AsyncStorage Data  │ hasExportData│ Export Button  │
├─────────────────────┼──────────────┼────────────────┤
│ No data             │ false        │ HIDDEN         │
│ Proofs only         │ true         │ VISIBLE        │
│ Audit trail only    │ true         │ VISIBLE        │
│ Tamper warnings only│ true         │ VISIBLE        │
│ All data            │ true         │ VISIBLE        │
└─────────────────────┴──────────────┴────────────────┘
```

---

## Cooldown Timer State

```
┌──────────────────────────────────────────────┐
│    Cooldown Timer Logic                      │
├──────────────────────────────────────────────┤
│                                              │
│  When: beforeTaken = true                    │
│        afterTaken = false                    │
│        activeSession exists                  │
│                                              │
│  Every 100ms:                                │
│    elapsed = now - metadata.timestamp        │
│    remaining = MAX(0, 60000 - elapsed)       │
│    setRemainingCooldownMs(remaining)         │
│                                              │
│  RENDER:                                     │
│    {remaining > 0 && <Countdown />}          │
│    disabled={remaining > 0}                  │
│                                              │
└──────────────────────────────────────────────┘

┌─────────────────┬──────────────┬────────────────┐
│ Time Elapsed    │ remainingMs   │ Button State   │
├─────────────────┼──────────────┼────────────────┤
│ 0s              │ 60000 ms     │ DISABLED       │
│ 15s             │ 45000 ms     │ DISABLED       │
│ 30s             │ 30000 ms     │ DISABLED       │
│ 45s             │ 15000 ms     │ DISABLED       │
│ 59s             │ 1000 ms      │ DISABLED       │
│ 60s+            │ 0 ms         │ ENABLED        │
└─────────────────┴──────────────┴────────────────┘
```

---

## Session Action Buttons Visibility

```
┌───────────────────────────────────────────────────────┐
│ Cancel Session & Delete Before Button Logic          │
├───────────────────────────────────────────────────────┤
│                                                       │
│ {beforeTaken && !afterTaken                           │
│  && activeSession?.isActive && (                      │
│    <Cancel & Delete Buttons />                        │
│ )}                                                    │
│                                                       │
│ ALL THREE conditions must be TRUE:                    │
│ 1. beforeTaken = true                                │
│ 2. afterTaken = false                                │
│ 3. activeSession.isActive = true                     │
│                                                       │
└───────────────────────────────────────────────────────┘

┌──────────────┬──────────────┬──────────────┬─────────────┐
│ beforeTaken  │ afterTaken   │ session.isA..│ Buttons     │
├──────────────┼──────────────┼──────────────┼─────────────┤
│ false        │ -            │ -            │ HIDDEN      │
│ true         │ false        │ true         │ VISIBLE ✓   │
│ true         │ false        │ false        │ HIDDEN      │
│ true         │ true         │ -            │ HIDDEN      │
│ -            │ true         │ -            │ HIDDEN      │
└──────────────┴──────────────┴──────────────┴─────────────┘
```

---

## Tamper Warning Visibility

```
┌───────────────────────────────────────────────────────┐
│ Tamper Warning Display Logic                         │
├───────────────────────────────────────────────────────┤
│                                                       │
│ {!activeSession && !beforeTaken                       │
│  && tamperWarnings.length > 0 && (                    │
│    <Tamper Warning Message />                         │
│ )}                                                    │
│                                                       │
│ ALL THREE conditions must be TRUE:                    │
│ 1. activeSession = null (IDLE state)                 │
│ 2. beforeTaken = false (not capturing)               │
│ 3. tamperWarnings.length > 0 (tampering detected)    │
│                                                       │
│ MESSAGE: \"⚠️ X TAMPERED SESSION(S)\"                  │
│          \"Check export for audit trail\"             │
│                                                       │
└───────────────────────────────────────────────────────┘

┌──────────────────┬──────────────┬──────────────┬────────────┐
│ activeSession    │ beforeTaken  │ tamperWarns. │ Warning    │
├──────────────────┼──────────────┼──────────────┼────────────┤
│ null             │ false        │ 0            │ HIDDEN     │
│ null             │ false        │ > 0          │ VISIBLE ✓  │
│ null             │ true         │ > 0          │ HIDDEN     │
│ not null         │ false        │ > 0          │ HIDDEN     │
│ not null         │ true         │ > 0          │ HIDDEN     │
└──────────────────┴──────────────┴──────────────┴────────────┘
```

---

## State Reset Function Flow

```
resetUIState() called from:
  ├─ completeSession() [after proof saved]
  └─ abandonSession() [user clicks cancel]

         │
         ▼

╔════════════════════════════════════════╗
║ resetUIState() - Clears ALL State      ║
╠════════════════════════════════════════╣
║                                        ║
║  1. setActiveSession(null)             ║
║  2. setBeforeUri(null)                 ║
║  3. setAfterUri(null)                  ║
║  4. setBeforeTaken(false)              ║
║  5. setAfterTaken(false)               ║
║  6. setMetadata(null)                  ║
║  7. setBeforeLocation(null)            ║
║  8. setValidationError(null)           ║
║  9. setMode('before')                  ║
║  10. setShowMetadataForm(false)        ║
║  11. setRemainingCooldownMs(0)         ║
║  12. AsyncStorage.removeItem()         ║
║  13. await checkExportDataExists()     ║
║      └─ Refreshes export button        ║
║                                        ║
╚════════════════════════════════════════╝

         │
         ▼
    
    All UI returns to HOME/IDLE STATE
```

---

## Component Lifecycle Hooks

```
┌─ APP MOUNT ─┐
│             │
│  useState() │
│  onMount()  │
│      │      │
│      ▼      │
│  initializeApp()
│    ├─ validateActiveSession()
│    ├─ checkExportDataExists() ◄─── [NEW]
│    ├─ Load tamper warnings
│    └─ Load editing violations
│
└─────┬───────┘
      │
      ▼
┌─ SCREEN FOCUS (Every tab switch) ─┐
│                                     │
│  useFocusEffect()                   │
│      │                              │
│      ▼                              │
│  refreshData()                      │
│    ├─ checkExportDataExists() ◄─── [UPDATED]
│    └─ Load tamper warnings          │
│
└──────────────────────────────────────┘

┌─ DURING SESSION (beforeTaken=true) ─┐
│                                      │
│  useEffect() [NEW]                   │
│      │                               │
│      ▼                               │
│  Interval: 100ms                     │
│      │                               │
│      ▼                               │
│  calculateRemainingCooldown()        │
│      │                               │
│      ▼                               │
│  setRemainingCooldownMs()            │
│      │                               │
│      ▼                               │
│  UI Updates                          │
│    - Countdown display               │
│    - Button disable state            │
│                                      │
│  Cleanup: clearInterval()            │
│
└──────────────────────────────────────┘
```

---

## Key Conditions Summary

| Feature | Condition | Location |
|---------|-----------|----------|
| Export Button | `{hasExportData && ...}` | Line 1168 |
| Cooldown Timer | `{remainingCooldownMs > 0 && ...}` | Line 1064 |
| Take After Button | `disabled={remainingCooldownMs > 0}` | Line 1075 |
| Session Buttons | `{beforeTaken && !afterTaken && activeSession?.isActive && ...}` | Line 1088 |
| Tamper Warning | `{!activeSession && !beforeTaken && tamperWarnings.length > 0 && ...}` | Line 1160 |

---

## Summary: What Changed

✅ **State**: Added `hasExportData` and `remainingCooldownMs`
✅ **Effects**: Added cooldown timer interval effect
✅ **Functions**: Added `checkExportDataExists()` and `calculateRemainingCooldown()`
✅ **Cleanup**: Added `resetUIState()` for consistent state cleanup
✅ **Rendering**: Added 5 new conditional checks for proper visibility
✅ **Styles**: Added `buttonDisabled` and `cooldownContainer` styles

❌ **NOT Changed**: Any core cryptographic or audit trail logic

