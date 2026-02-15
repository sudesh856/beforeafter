package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"time"

	"github.com/gorilla/mux"
)

func createProof(w http.ResponseWriter, r *http.Request) {
	log.Println("📥 Received POST /proofs request")

	var payload struct {
		Proof     Proof  `json:"proof"`
		Signature string `json:"signature"`
	}

	err := json.NewDecoder(r.Body).Decode(&payload)
	if err != nil {
		log.Printf("❌ JSON decode error: %v", err)
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	log.Printf("✅ Decoded proof ID: %s", payload.Proof.ProofID)
	log.Printf("✅ Worker ID: %s", payload.Proof.WorkerID)
	// Log key ID if present
	if payload.Proof.KeyID != "" {
		log.Printf("🔑 Key ID: %s", payload.Proof.KeyID)
	}
	log.Printf("✅ Signature length: %d", len(payload.Signature))

	proofJSON, err := json.Marshal(payload.Proof)
	if err != nil {
		log.Printf("❌ JSON marshal error: %v", err)
		http.Error(w, "Failed to marshal proof", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Proof JSON length: %d bytes", len(proofJSON))

	// Insert with key_id (might be empty string for old clients, which is fine)
	_, err = db.Exec("INSERT INTO proofs (proof_id, worker_id, data, signature, key_id) VALUES (?, ?, ?, ?, ?)",
		payload.Proof.ProofID, payload.Proof.WorkerID, string(proofJSON), payload.Signature, payload.Proof.KeyID)

	if err != nil {
		log.Printf("❌ Database insert error: %v", err)
		http.Error(w, "Failed to store proof", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Proof %s stored successfully", payload.Proof.ProofID)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func generatePin(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	proofID := vars["proofId"]

	log.Printf("📍 Generating PIN for proof: %s", proofID)

	var exists bool
	err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM proofs WHERE proof_id = ?)", proofID).Scan(&exists)
	if err != nil || !exists {
		log.Printf("❌ Proof not found: %s", proofID)
		http.Error(w, "Proof not found", http.StatusNotFound)
		return
	}

	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	pin := make([]byte, 10)
	for i := range pin {
		pin[i] = charset[rand.Intn(len(charset))]
	}
	pinStr := string(pin)

	expiresAt := time.Now().Add(24 * time.Hour).Format(time.RFC3339)

	_, err = db.Exec("INSERT INTO pins (pin, proof_id, expires_at) VALUES (?, ?, ?)",
		pinStr, proofID, expiresAt)

	if err != nil {
		log.Printf("❌ Failed to insert PIN: %v", err)
		http.Error(w, "Failed to generate PIN", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ PIN generated: %s (expires: %s)", pinStr, expiresAt)

	response := PinResponse{Pin: pinStr}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func verifyPin(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	pin := vars["pin"]

	log.Printf("🔍 Verifying PIN: %s", pin)

	var proofID string
	var expiresAtStr string
	err := db.QueryRow("SELECT proof_id, expires_at FROM pins WHERE pin = ?", pin).Scan(&proofID, &expiresAtStr)

	if err == sql.ErrNoRows {
		log.Printf("❌ PIN not found: %s", pin)
		http.Error(w, "Invalid or expired PIN", http.StatusNotFound)
		return
	}

	if err != nil {
		log.Printf("❌ Failed to fetch PIN: %v", err)
		http.Error(w, "Failed to verify PIN", http.StatusInternalServerError)
		return
	}

	expiresAt, err := time.Parse(time.RFC3339, expiresAtStr)
	if err != nil {
		log.Printf("❌ Failed to parse expiration time: %v", err)
		http.Error(w, "Invalid expiration time", http.StatusInternalServerError)
		return
	}

	log.Printf("🕒 Current Server Time: %s", time.Now().Format(time.RFC3339))
	log.Printf("🛑 Expiration Time from DB: %s", expiresAt.Format(time.RFC3339))

	if time.Now().After(expiresAt) {
		log.Printf("❌ PIN EXPIRED! Now: %s > Expires: %s", time.Now(), expiresAt)
		http.Error(w, "PIN expired", http.StatusGone)
		return
	}

	log.Printf("✅ PIN is valid and not expired")

	// Helper to handle NULL key_id from DB
	var proofData, signature, workerID string
	var keyID sql.NullString

	err = db.QueryRow("SELECT data, signature, worker_id, key_id FROM proofs WHERE proof_id = ?", proofID).Scan(&proofData, &signature, &workerID, &keyID)
	if err != nil {
		log.Printf("❌ Failed to fetch proof data: %v", err)
		http.Error(w, "Proof not found", http.StatusNotFound)
		return
	}

	log.Printf("✅ Proof data retrieved for worker: %s", workerID)

	var publicKey string
	var revokedAt sql.NullTime

	if keyID.Valid && keyID.String != "" {
		// Versioned lookup
		log.Printf("🔑 Looking up specific key ID: %s", keyID.String)
		err = db.QueryRow("SELECT public_key, revoked_at FROM worker_keys WHERE key_id = ?", keyID.String).Scan(&publicKey, &revokedAt)
		if err == sql.ErrNoRows {
			// Fallback: try to find by worker_id? No, if key_id is specified it MUST match.
			log.Printf("❌ Key ID %s not found", keyID.String)
			http.Error(w, "Signing key not found", http.StatusNotFound)
			return
		}
	} else {
		// Legacy lookup: get latest active key for worker
		// Note: This might fail legacy proof verification if the key was rotated.
		// But per spec "If key_id absent -> fall back to latest active key".
		log.Printf("⚠️ No key ID in proof, falling back to latest active key for worker: %s", workerID)
		err = db.QueryRow("SELECT public_key, revoked_at FROM worker_keys WHERE worker_id = ? ORDER BY created_at DESC LIMIT 1", workerID).Scan(&publicKey, &revokedAt)
		if err == sql.ErrNoRows {
			log.Printf("❌ No keys found for worker %s", workerID)
			http.Error(w, "Worker public key not found", http.StatusNotFound)
			return
		}
	}

	if err != nil {
		log.Printf("❌ Database error fetching key: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Public key retrieved")

	var proof Proof
	json.Unmarshal([]byte(proofData), &proof)

	db.Exec("DELETE FROM pins WHERE pin = ?", pin)
	log.Printf("✅ PIN deleted after successful verification")

	response := map[string]interface{}{
		"proof":           proof,
		"signature":       signature,
		"workerPublicKey": publicKey,
		"keyRotated":      revokedAt.Valid, // true if key has been revoked (rotated)
	}

	log.Printf("📤 Sending response to client")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func registerPublicKey(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workerID := vars["workerId"]

	log.Printf("📥 Registering public key for worker: %s", workerID)

	var payload struct {
		PublicKey string `json:"publicKey"`
	}

	err := json.NewDecoder(r.Body).Decode(&payload)
	if err != nil {
		log.Printf("❌ JSON decode error: %v", err)
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Compute Key ID (SHA-256 of public key)
	// We assume public Key IS the base64 string.
	// We want key_id to be deterministic.
	hash := sha256.Sum256([]byte(payload.PublicKey))
	keyID := hex.EncodeToString(hash[:])

	log.Printf("🔑 Key ID computed: %s", keyID)

	// Check if THIS specific key exists (idempotency)
	var existingKeyID string
	err = db.QueryRow("SELECT key_id FROM worker_keys WHERE key_id = ?", keyID).Scan(&existingKeyID)

	if err == nil {
		// Key exists
		log.Printf("ℹ️  Key %s already registered", keyID)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "already_registered",
			"keyId":  keyID,
		})
		return
	} else if err != sql.ErrNoRows {
		log.Printf("❌ Database error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Key does not exist. This is a NEW key.
	// 1. Revoke old keys for this worker
	log.Printf("🔄 Revoking old keys for worker: %s", workerID)
	_, err = db.Exec("UPDATE worker_keys SET revoked_at = ? WHERE worker_id = ? AND revoked_at IS NULL",
		time.Now(), workerID)

	if err != nil {
		log.Printf("❌ Failed to revoke old keys: %v", err)
		// Continue anyway? Best effort.
	}

	// 2. Insert new key
	log.Printf("📝 Inserting new key: %s", keyID)
	_, err = db.Exec("INSERT INTO worker_keys (key_id, worker_id, public_key, created_at) VALUES (?, ?, ?, ?)",
		keyID, workerID, payload.PublicKey, time.Now())

	if err != nil {
		log.Printf("❌ Failed to insert public key: %v", err)
		http.Error(w, "Failed to store public key", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Public key registered successfully")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "registered",
		"keyId":  keyID,
	})
}
