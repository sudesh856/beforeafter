# Component Architecture - Premium UI Layer

## Overview
This document describes the new UI components and styling system added during the design overhaul.

---

## New Components

### 1. **OnboardingScreen** (`app/onboarding.tsx`)
**Purpose:** First-run experience to establish trust before main app functionality

**Props:** None (uses AsyncStorage state management)

**Features:**
- Logo placeholder with cyan border badge
- Feature highlights with icons (✓ 🔐 📋)
- Full-width primary CTA
- Footer tagline
- Automatic navigation on proceed

**Styling:**
- Background: `Colors.background` (#0D0D0D)
- Logo badge: 120x120, cyan border, centered
- Buttons: Full width, proper padding
- Typography: H1 for heading, body for description

**State Flow:**
```
App loads
  ↓
Check AsyncStorage.hasOnboarded
  ├─ true  → Show (tabs)
  └─ false → Show onboarding.tsx
             ↓
             User taps "PROCEED AHEAD"
             ↓
             Set hasOnboarded = true
             ↓
             Navigate to /(tabs)
```

---

### 2. **CaptureScreenUI** (`components/CaptureScreenUI.tsx`)
**Purpose:** Reusable UI component wrapping capture screen logic with premium styling

**Props:**
```tsx
interface CaptureScreenUIProps {
  // Status indicators
  isProcessing: boolean
  processingMessage: string | null
  validationError: string | null
  beforeTaken: boolean
  afterTaken: boolean
  
  // Session info
  sessionActive: boolean
  sessionId?: string
  
  // Time window state
  elapsedTimeMs: number
  timeWindowStatus: 'VALID' | 'INVALID' | 'EXPIRED' | null
  selectedMinTimeMin: number | null
  selectedMaxTimeMin: number | null
  
  // Metadata
  jobId: string
  clientName: string
  showMetadataForm: boolean
  sessionMetadata: any
  
  // Handlers
  onTakeBefore: () => void
  onTakeAfter: () => void
  onCancelSession: () => void
  onSetTimeWindow: () => void
  onToggleMetadataForm: () => void
  onSaveMetadata: (jobId: string, clientName: string) => void
  onExport: () => void
  onCameraOpen: () => void
  
  // State setters
  setJobId: (id: string) => void
  setClientName: (name: string) => void
}
```

**Key Sections:**
1. **Header** - App title + subtitle
2. **Processing Indicator** - Spinner + message
3. **Error Container** - Red-bordered error box
4. **Session Banner** - Locked icon + status
   - Time window display with progress
   - Status chip (Valid/Not Ready/Expired)
5. **Metadata Card** - Job ID & client name form
6. **Action Section** - Primary buttons
7. **Info Footer** - "How It Works" guide

**Styling Highlights:**
- Session banner uses left cyan border
- Error uses left red border
- Buttons have proper shadow depth
- Time display in large cyan text
- Responsive padding with Spacing tokens

---

### 3. **ProofsScreen with Grid** (`app/(tabs)/proofs.tsx`)
**Purpose:** Gallery of verified proofs with export capabilities

**State:**
```tsx
const [proofs, setProofs] = useState<ProofRecord[]>([])
const [selectedProof, setSelectedProof] = useState<ProofRecord | null>(null)
```

**Sections:**

#### Empty State
```
📋 icon
"No Proofs Yet"
Subtitle: "Start by taking..."
CTA button to Capture tab
```

#### Populated State

**Header:**
- Title: "Proof Library" (H1)
- Counter: "{X} verified proofs"

**Clear Button:**
- Danger styled (red background)
- Full width option
- Confirmation dialog recommended

**Export Section:**
- Section title: "📤 Export Latest"
- Wraps ExportButtons component
- Shows first proof's export options

**Proof Grid:**
- Dynamic grid of ProofGridItem components
- 2-column on mobile, scales up
- Responsive gap spacing

**ProofGridItem Sub-Component:**
```tsx
<Pressable onPress={() => router.push(`/proof/${id}`)}>
  <ProofCard>
    <ImageContainer>
      <Image source={before} resizeMode="cover" />
      <Badge>BEFORE</Badge>
    </ImageContainer>
    <InfoSection>
      <Timestamp>Jan 15, 2:30 PM</Timestamp>
      <MetadataLine>📋 Job ID: {jobId}</MetadataLine>
      <StatusRow>
        <VerifiedBadge>✅ Verified</VerifiedBadge>
        <VerificationCode>{code.substring(0, 8)}</VerificationCode>
      </StatusRow>
    </InfoSection>
  </ProofCard>
</Pressable>
```

**Info Box:**
- Cyan left border
- Verification details list
- Supporting text styling

---

## Design System Components

### 4. **uiTheme.ts** - Design Tokens
**Purpose:** Single source of truth for all design values

**Exports:**

```tsx
Colors: {
  background: '#0D0D0D'
  surface: '#1A1A1A'
  surfaceAlt: '#242424'
  primary: '#00D4FF'
  success: '#00E676'
  warning: '#FFB300'
  danger: '#FF3B30'
  textPrimary: '#FFFFFF'
  textSecondary: '#B0B0B0'
  textTertiary: '#808080'
  border: '#333333'
  borderLight: '#404040'
}

Spacing: {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32
}

BorderRadius: {
  sm: 8, md: 12, lg: 16, xl: 20, full: 9999
}

Typography: {
  h1: { fontSize: 32, fontWeight: '700', lineHeight: 40 }
  h2: { fontSize: 24, fontWeight: '700', lineHeight: 32 }
  h3: { fontSize: 20, fontWeight: '600', lineHeight: 28 }
  body: { fontSize: 16, fontWeight: '400', lineHeight: 24 }
  bodyMedium: { fontSize: 14, fontWeight: '500', lineHeight: 20 }
  bodySmall: { fontSize: 12, fontWeight: '400', lineHeight: 16 }
  caption: { fontSize: 11, fontWeight: '400', lineHeight: 14 }
}

Shadows: {
  sm: { shadowOffset: 0/2, shadowRadius: 4, elevation: 2 }
  md: { shadowOffset: 0/4, shadowRadius: 8, elevation: 4 }
  lg: { shadowOffset: 0/8, shadowRadius: 12, elevation: 8 }
}
```

**Usage:**
```tsx
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '@/constants/uiTheme'

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadows.md
  },
  title: {
    ...Typography.h1,
    color: Colors.textPrimary
  }
})
```

---

### 5. **screenStyles.ts** - Component Styles
**Purpose:** Reusable StyleSheet objects for each screen

**Exports:**

**CaptureScreenStyles:**
- `container` - Flex: 1, background
- `safeContainer` - Safe area wrapper
- `header` - Title + subtitle area
- `statusBadge` - Session info display
- `timeWindowSection` - Time display card
- `sessionInfo` - Active session banner
- `primaryButton` - Dominant action
- `errorContainer` - Error messages
- `formInput` - Metadata form
- `captureButton` - Camera trigger

**ProofsScreenStyles:**
- `container` - Root wrapper
- `emptyStateContainer` - No proofs display
- `gridContainer` - Proof grid wrapper
- `proofCard` - Individual proof item
- `proofImage` - Image container (1:1)
- `exportSection` - Export buttons area
- `infoBox` - Verification info footer
- `tamperWarning` - Tamper alert display

---

## Integration Pattern

### Using CaptureScreenUI in index.tsx

```tsx
import { CaptureScreenUI } from '@/components/CaptureScreenUI'

export default function HomeScreen() {
  // ... all existing logic ...
  
  return (
    <CaptureScreenUI
      isProcessing={isProcessing}
      processingMessage={processingMessage}
      validationError={validationError}
      beforeTaken={beforeTaken}
      afterTaken={afterTaken}
      sessionActive={activeSession?.isActive}
      sessionId={activeSession?.id}
      elapsedTimeMs={elapsedTimeMs}
      timeWindowStatus={timeWindowStatus}
      selectedMinTimeMin={selectedMinTimeMin}
      selectedMaxTimeMin={selectedMaxTimeMin}
      jobId={jobId}
      clientName={clientName}
      showMetadataForm={showMetadataForm}
      sessionMetadata={sessionMetadata}
      onTakeBefore={() => handleTakeBefore()}
      onTakeAfter={() => handleTakeAfter()}
      onCancelSession={abandonSession}
      onSetTimeWindow={() => setShowTimeWindowForm(true)}
      onToggleMetadataForm={() => setShowMetadataForm(!showMetadataForm)}
      onSaveMetadata={onSaveMetadata}
      onExport={exportAuditTrail}
      onCameraOpen={() => setShowCamera(true)}
      setJobId={setJobId}
      setClientName={setClientName}
    />
  )
}
```

---

## Styling Best Practices

### 1. **Always Use Design Tokens**
```tsx
// ✅ Good
const bgColor = Colors.background
const padding = Spacing.lg
const radius = BorderRadius.lg

// ❌ Bad
const bgColor = '#0D0D0D'
const padding = 16
const radius = 16
```

### 2. **Spread Typography**
```tsx
// ✅ Good
const titleStyle = {
  ...Typography.h1,
  color: Colors.textPrimary
}

// ❌ Bad - Lost lineHeight
const titleStyle = {
  fontSize: 32,
  fontWeight: '700',
  color: Colors.textPrimary
}
```

### 3. **Use Shadows Consistently**
```tsx
// ✅ Good - Cards elevated
...Shadows.md

// ❌ Bad - Inconsistent elevation
shadowOpacity: 0.2
shadowRadius: 5
```

### 4. **SafeAreaView for Mobile**
```tsx
// ✅ Good
<SafeAreaView style={styles.container}>
  <ScrollView>
    {content}
  </ScrollView>
</SafeAreaView>

// ❌ Bad - Content under notch
<View style={styles.container}>
  {content}
</View>
```

---

## Responsive Layout Checklist

- [ ] SafeAreaView wrapper
- [ ] ScrollView for overflow content
- [ ] Flexbox for alignment (no absolute positioning)
- [ ] Gap spacing between items
- [ ] Touch targets minimum 44x44pt
- [ ] Text minimum 16px (readable)
- [ ] Images with `resizeMode: 'cover'`
- [ ] Aspect ratio locks (for images)
- [ ] Proper horizontal padding (not full width)
- [ ] Testing on 320px width device

---

## Color Application Guide

| Element | Color | Reason |
|---------|-------|--------|
| **Background** | `#0D0D0D` | Deep, stable, professional |
| **Cards/Surfaces** | `#1A1A1A` | Elevated, readable |
| **Buttons (CTA)** | `#00D4FF` | High contrast, trustworthy |
| **Text Primary** | `#FFFFFF` | Max contrast on dark |
| **Text Secondary** | `#B0B0B0` | Supporting text, readable |
| **Errors** | `#FF3B30` | Clear destructive intent |
| **Success** | `#00E676` | Green verification signals |
| **Borders** | `#333333` | Subtle structure |

---

## Component Hierarchy

```
RootLayout (onboarding check)
├── OnboardingScreen (first-run)
└── TabLayout (main app)
    ├── CaptureScreenUI (visual wrapper)
    │   └── Logic from index.tsx
    └── ProofsScreen
        ├── ProofGridItem (subcomponent)
        ├── ExportButtons (existing)
        └── ScrollView with grid
```

---

## Reusability

### CaptureScreenUI
- Fully decoupled from logic
- Can be tested independently
- Props-driven behavior
- Easy to remix or modify styling

### Design Tokens
- Used in ALL components
- Single edit = app-wide change
- Enables theming system future
- Consistency guaranteed

### Style Sheets
- Scoped to specific screens
- Easy to locate component styles
- Clear naming conventions
- No global style pollution

---

## Maintenance Notes

1. **Add New Colors?** → Update `uiTheme.ts`
2. **Update Typography?** → Update Typography object
3. **New Screen?** → Create in `screenStyles.ts`
4. **Modify Button Style?** → Find in screen-specific styles
5. **Dark Mode Only?** → Already implemented (no light mode needed)

---

**All components production-ready and TypeScript compliant.**
