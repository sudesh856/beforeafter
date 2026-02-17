# Cryptographic Proof-of-Work Verification System

A mobile application that provides cryptographically verifiable, tamper-proof documentation of service work through before/after photo capture with Ed25519 digital signatures, external timestamp anchoring, and GPS verification.

## Overview

This system enables workers to generate mathematically verifiable proof of completed work, and allows clients to independently verify that proof without trusting the application backend. The entire verification process is client-side, ensuring zero-trust security.

## Core Problem Solved

Service workers and clients frequently face disputes over:
- Whether work was actually completed
- Quality of work performed
- Time spent on-site
- Original condition vs. final condition

This application eliminates these disputes through cryptographic proof that cannot be forged or tampered with.

## Key Features

### Cryptographic Security
- **Ed25519 Digital Signatures**: All proof data is signed with the worker's private key
- **SHA-256 Hashing**: Photos and metadata are cryptographically hashed
- **Fireflower Fingerprints**: Visual cryptographic fingerprints for quick verification
- **Integrity Verification**: Real-time tamper detection with clear VERIFIED/TAMPERED status

### Timestamp Verification
- **External TSA Integration**: RFC 3161 compliant timestamp anchoring via freetsa
- **Independent Third-Party Proof**: Timestamps cannot be manipulated by any party
- **Work Window Tracking**: Precise start/end times with session duration

### Location Verification
- **GPS Coordinate Capture**: Both before/after photos include location data
- **Accuracy Metrics**: Plus/minus meter accuracy reporting
- **Distance Calculation**: Automatic distance measurement between photo locations
- **On-Site Verification**: Proves worker was physically present during work

### Proof Generation Workflow

**Worker Side:**
1. Select "I am a worker"
2. Configure time session (1-10 minutes)
3. Capture "before" photo
4. Wait for session timer completion
5. Capture "after" photo
6. System generates proof (5-7 seconds processing)
7. Receive unique 10-digit verification code
8. Share code with client

**During Processing:**
- Photo hashing (SHA-256)
- GPS coordinate extraction
- Device metadata collection
- Ed25519 signature generation
- External timestamp anchoring (TSA)
- Proof hash chain creation

**Client Side:**
1. Select "I am a client"
2. Enter 10-digit verification code
3. Local cryptographic verification executes
4. View complete proof details (if valid and not expired)
5. All data runs in ephemeral memory sandbox (zero retention after session)

### Proof Details Available

- Before/after images (cryptographically hashed)
- Fireflower cryptographic visual fingerprint
- Unique verification code
- GPS coordinates with accuracy
- Distance between photo locations
- Complete time analysis (start, end, work window)
- External timestamp anchor data
- Technical hash information (before, after, proof hashes)
- Device metadata (name, platform, algorithm)
- AI-generated narrative of work performed
- Integrity verification status

### Export Capabilities

- JSON report
- PDF report  
- Legal JSON evidence format
- Legal PDF evidence format
- Audit trail export
- Verification code sharing

### Audit Trail System

- Comprehensive logging of all actions
- Cancelled session tracking
- Tamper attempt recording
- Complete session history
- Exportable for legal/compliance purposes

## Technical Stack

### Backend
- **Language**: Go (Golang)
- **Function**: Proof storage, code generation, API endpoints

>  **Note:** The backend runs locally. You must either run it on your own machine and update `app/config/api.ts` with your IP address, or deploy it to your own server.

### Cryptography
- **Digital Signatures**: Ed25519
- **Hashing**: SHA-256
- **Timestamp Authority**: freetsa (RFC 3161 compliant)

### Client-Side Operations
- Local signature verification
- Zero-trust model (no backend trust required)
- Ephemeral memory sandbox for client proof viewing

### Storage
- Asynchronous image storage
- Cryptographic hashing before storage
- Secure proof data persistence

### AI Integration
- Image narrative generation
- Contextual work description

## Security Model

### Zero-Trust Architecture
Clients verify all cryptographic signatures locally. No trust in the application backend, the worker, or any intermediary is required. The mathematics guarantee authenticity.

### Tamper Detection
Any modification to proof data invalidates the Ed25519 signature, immediately marking the proof as TAMPERED. This includes:
- Photo alterations
- Timestamp modifications
- GPS coordinate changes
- Metadata tampering

### Code Expiration
Verification codes expire after 24 hours for security purposes.

### Client Data Isolation
Client-side proof viewing operates in an ephemeral memory sandbox. All data is destroyed when the client exits the verification view.

## Use Cases

### Primary Markets
- Cleaning services (residential, commercial, carpet)
- Maintenance workers (HVAC, plumbing, electrical)
- Landscaping and gardening
- Delivery and logistics
- Construction and contracting
- Property management
- Auto detailing and mechanics
- Painting services
- Pest control
- Inspection services

### Worker Benefits
- Protection against false claims
- Dispute resolution evidence
- Professional credibility enhancement
- Payment protection
- Legal defense capability
- Verifiable work portfolio

### Client Benefits
- Independent verification capability
- Zero backend trust requirement
- Quality assurance documentation
- Dispute evidence
- Worker accountability
- Legal protection

## What This System Is NOT

- Not a payment processing platform
- Not a worker marketplace or job matching service
- Not a project management tool
- Not a communication platform
- Not designed for real-time collaboration
- Not a permanent record retrieval system (24-hour code expiration)

## Installation

npm install

## Contact

mozar.t@yahoo.com
---

## Environment Configuration

### API Key Setup

This application requires API keys for AI-powered features. To maintain security and enable functionality:

1. Create a `.env` file in the project root directory
2. Add your API credentials:
```
GROQ_API_KEY=your_groq_api_key_here
GOOGLE_AI_API_KEY=your_google_ai_key_here
```

3. Ensure `.env` is listed in your `.gitignore` file to prevent credential exposure

**Note:** The AI narrative generation feature requires a valid Groq API key. Obtain your key from [https://groq.com](https://groq.com).


### UPDATE:
Previously, the system stored only one public key per worker and overwrote it on reinstall or device change, meaning any proofs signed with an old key could no longer be verified once the key was updated, silently breaking long-term integrity. Now, the system adds immutable, key_id-based public-key versioning, where every device or reinstall creates a new key that is appended (not replaced), each proof records the exact key used to sign it, and verification fetches that specific key—while old proofs remain valid and simply show an informational “key rotated” flag if the signing key was later superseded. This matters because it restores cryptographic continuity: proofs become permanently verifiable evidence rather than state-dependent artifacts, enabling audits, disputes, and trust over time without changing any existing hashing, signing, or API behavior.

### Security Best Practices

- Never commit API keys to version control
- Rotate keys periodically
- Use environment-specific keys for development and production
- Revoke compromised keys immediately


### Why Ed25519?
- Fast signature generation and verification
- Small signature size (64 bytes)
- High security (equivalent to 3072-bit RSA)
- Deterministic signatures (same input always produces same output)

### Why External TSA?
- Independent third-party verification
- Legal defensibility in court
- Cannot be manipulated by application or users
- RFC 3161 compliance for industry standard compatibility

### Why Client-Side Verification?
- Eliminates need to trust the backend
- User maintains complete control
- Proof remains valid even if backend is compromised
- True decentralization of trust

### Why 24-Hour Expiration?
- Security best practice for verification codes
- Encourages timely verification
- Reduces attack surface for code interception
- Balances usability with security

## Future Roadmap

[Planned features and improvements to be added]
