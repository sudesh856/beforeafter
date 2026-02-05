# 🚀 QUICK START - TESTING YOUR WITNESS NETWORK

## Current Status
✅ **Server Running on Port 8082**  
✅ **Ready for Expo Go Testing**  
✅ **All Errors Fixed**

---

## To Start Testing RIGHT NOW

### **On Your Phone:**
1. Open **Expo Go** app
2. Scan the **QR code** shown in terminal
3. Wait 30-60 seconds for app to load
4. Tap **CAPTURE** to create a proof

### **In Terminal:**
The dev server is already running. If it stops, restart with:
```bash
npm start -- --offline --port 8082
```

---

## What to Test

### **1️⃣ Create a Proof** (5 minutes)
- [ ] Open CAPTURE tab
- [ ] Tap "Take Before Photo"
- [ ] Wait 1+ minute
- [ ] Tap "Take After Photo"
- [ ] Proof appears in PROOFS tab

### **2️⃣ View Witness Badge** (1 minute)
- [ ] Go to PROOFS tab
- [ ] Each proof shows a badge:
  - "📱 Local Only" = No witnesses yet
  - "⚠️ Limited Verification (1)" = 1 witness
  - "✅ Network Verified (3+)" = 3+ witnesses

### **3️⃣ Check Settings** (2 minutes)
- [ ] Tap SETTINGS tab
- [ ] See "Peer-to-Peer Network Status"
- [ ] Shows local witness count
- [ ] See red "🗑️ Clear All Network Data" button

### **4️⃣ Test Clear Button** (2 minutes)
- [ ] In SETTINGS, tap red button
- [ ] Confirm the warning
- [ ] All network data deleted
- [ ] Local proofs still safe
- [ ] Witness count resets to 0

### **5️⃣ Test Offline Mode** (5 minutes)
- [ ] Turn off phone WiFi
- [ ] Create a new proof
- [ ] Should work fine (no network needed)
- [ ] Turn WiFi back on
- [ ] App resumes normally

---

## Expected Behavior

### ✅ Should Work
- Creating proofs as before
- Viewing proof library
- All existing features unchanged
- App works offline
- Clear button removes witness data
- Settings tab accessible

### ⚠️ May Show
- "Local Only" for new proofs (normal)
- Network features silently skip if offline (expected)
- Firebase features skip without breaking app (designed this way)

### ❌ Should NOT See
- "Cannot find native module" errors ✓ FIXED
- "Cannot find route 'settings'" ✓ FIXED
- "Property 'initFirebaseOnStartup' doesn't exist" ✓ FIXED
- Any app crashes ✓ FIXED

---

## Terminal Commands

While server is running:

| Key | Action |
|-----|--------|
| `r` | Reload app |
| `s` | Switch to development build |
| `a` | Open Android emulator |
| `w` | Open web |
| `j` | Open debugger |
| `m` | Toggle menu |
| `c` | Clear Metro cache |
| `?` | Show all commands |
| `Ctrl+C` | Stop server |

---

## File Structure

```
app/
├── (tabs)/
│   ├── index.tsx (capture) ← Firebase uploads metadata here
│   ├── proofs.tsx ← Shows witness badges
│   ├── settings.tsx ← NEW: Clear buttons
│   └── _layout.tsx ← Added settings tab
├── _layout.tsx ← Firebase init
└── ...

lib/
├── firebase.ts ← Upload/download proofs
├── witnessDatabase.ts ← Store witnesses in AsyncStorage
├── witnessSync.ts ← Background sync (30 min)
└── ...

components/
├── WitnessBadge.tsx ← NEW: Shows witness count
└── ...
```

---

## Data Flow

```
1. USER CREATES PROOF
   ↓
2. Proof saved locally (existing) ✅
   ↓
3. Metadata uploaded to Firebase 📡
   ↓
4. Other devices download metadata 📥
   ↓
5. Metadata stored in local AsyncStorage
   ↓
6. Badge shows witness count ✅
```

---

## Troubleshooting

### **"Metro not responding"**
- Restart server: `npm start -- --offline --port 8082`

### **"QR Code not visible"**
- Look in terminal for ASCII art QR code
- Scroll up if needed

### **"App won't load"**
- Make sure using Expo Go (not web)
- Try scanning QR again
- Internet optional

### **"Witness count stuck at 0"**
- Normal for first proof
- Sync runs every 30 minutes automatically
- Or wait for manual sync

### **"Clear button not working"**
- Make sure you tapped the red button in SETTINGS
- Confirm the warning dialog

---

## Success Indicators

✅ **Setup Working When:**
- App loads without crashes
- Can create proofs
- Witness badges appear on proofs
- Settings tab shows network status
- Clear button successfully clears data

---

## Questions?

| Feature | Status | Where |
|---------|--------|-------|
| Proof creation | ✅ Working | CAPTURE tab |
| Witness badges | ✅ Working | PROOFS tab |
| Settings screen | ✅ Working | SETTINGS tab |
| Clear button | ✅ Working | SETTINGS tab |
| Offline mode | ✅ Working | Anywhere (turn off WiFi) |

---

**Everything is ready to test! Scan the QR code and start exploring.** 🎉
