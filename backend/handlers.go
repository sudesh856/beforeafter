package main

import (
	"database/sql"
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
	log.Printf("✅ Signature length: %d", len(payload.Signature))

	proofJSON, err := json.Marshal(payload.Proof)
	if err != nil {
		log.Printf("❌ JSON marshal error: %v", err)
		http.Error(w, "Failed to marshal proof", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Proof JSON length: %d bytes", len(proofJSON))

	_, err = db.Exec("INSERT INTO proofs (proof_id, worker_id, data, signature) VALUES (?, ?, ?, ?)",
		payload.Proof.ProofID, payload.Proof.WorkerID, string(proofJSON), payload.Signature)

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

	var proofData, signature, workerID string
	err = db.QueryRow("SELECT data, signature, worker_id FROM proofs WHERE proof_id = ?", proofID).Scan(&proofData, &signature, &workerID)
	if err != nil {
		log.Printf("❌ Failed to fetch proof data: %v", err)
		http.Error(w, "Proof not found", http.StatusNotFound)
		return
	}

	log.Printf("✅ Proof data retrieved for worker: %s", workerID)

	var publicKey string
	err = db.QueryRow("SELECT public_key FROM worker_keys WHERE worker_id = ?", workerID).Scan(&publicKey)
	if err != nil {
		log.Printf("❌ Failed to fetch public key for worker %s: %v", workerID, err)
		http.Error(w, "Worker public key not found", http.StatusNotFound)
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

	log.Printf("✅ Public key length: %d", len(payload.PublicKey))

	var existingKey string
	err = db.QueryRow("SELECT public_key FROM worker_keys WHERE worker_id = ?", workerID).Scan(&existingKey)

	if err == sql.ErrNoRows {
		log.Printf("🔑 First time registration for worker: %s", workerID)

		_, err = db.Exec("INSERT INTO worker_keys (worker_id, public_key, created_at) VALUES (?, ?, ?)",
			workerID, payload.PublicKey, time.Now())

		if err != nil {
			log.Printf("❌ Failed to insert public key: %v", err)
			http.Error(w, "Failed to store public key", http.StatusInternalServerError)
			return
		}

		log.Printf("✅ Public key registered successfully")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"status": "registered"})
	} else {
		log.Printf("ℹ️  Public key already exists for worker: %s", workerID)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "already_registered"})
	}
}
