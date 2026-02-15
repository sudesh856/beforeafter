package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"log"

	_ "modernc.org/sqlite"
)

var db *sql.DB

func initDB() {
	var err error
	db, err = sql.Open("sqlite", "./beforeafter.db")
	if err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS proofs (
			proof_id TEXT PRIMARY KEY,
			worker_id TEXT,
			data TEXT,
			signature TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(`DROP TABLE IF EXISTS pins`)
	if err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(`
	CREATE TABLE pins (
		pin TEXT PRIMARY KEY,
		proof_id TEXT,
		expires_at TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)
`)
	if err != nil {
		log.Fatal(err)
	}

	
	rows, err := db.Query("PRAGMA table_info(proofs)")
	proofsHasKeyID := false
	if err == nil && rows != nil {
		for rows.Next() {
			var cid int
			var name, ctype string
			var notnull, pk int
			var dflt interface{}
			rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk)
			if name == "key_id" {
				proofsHasKeyID = true
				break
			}
		}
		rows.Close()
	}

	// Only add the column if it doesn't exist
	if !proofsHasKeyID {
		_, err = db.Exec(`ALTER TABLE proofs ADD COLUMN key_id TEXT`)
		if err != nil {
			log.Println("⚠️  (Migration) Error adding key_id to proofs:", err)
		} else {
			log.Println("✅ (Migration) Added key_id column to proofs table")
		}
	}

	// Check if worker_keys needs migration
	// Old schema: worker_id (PK), public_key, created_at
	// New schema: key_id (PK), worker_id, public_key, revoked_at, created_at

	rows, err = db.Query("PRAGMA table_info(worker_keys)")
	hasKeyID := false
	if err == nil && rows != nil {
		for rows.Next() {
			var cid int
			var name, ctype string
			var notnull, pk int
			var dflt interface{}
			rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk)
			if name == "key_id" {
				hasKeyID = true
				break
			}
		}
		rows.Close()
	}

	// Check if table exists at all (by checking if we got any rows or error)
	// If table doesn't exist, we create the new one in the 'else' block
	// Logic: if table exists AND !hasKeyID -> migrate.
	// if table exists AND hasKeyID -> good.
	// if table doesn't exist -> create new.

	var tableExists bool
	err = db.QueryRow("SELECT 1 FROM sqlite_master WHERE type='table' AND name='worker_keys'").Scan(&tableExists)
	isNewInstall := err != nil // if error, table likely doesn't exist

	if !isNewInstall && !hasKeyID {
		log.Println("🔄 Migrating worker_keys table to support key versioning...")

		// 1. Rename old table
		_, err = db.Exec("ALTER TABLE worker_keys RENAME TO worker_keys_legacy")
		if err != nil {
			log.Fatal("Failed to rename worker_keys:", err)
		}

		// 2. Create new table
		_, err = db.Exec(`
			CREATE TABLE worker_keys (
				key_id TEXT PRIMARY KEY,
				worker_id TEXT NOT NULL,
				public_key TEXT NOT NULL,
				revoked_at DATETIME,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`)
		if err != nil {
			log.Fatal("Failed to create new worker_keys table:", err)
		}

		// 3. Migrate data
		// Read ALL data into memory first to avoid SQLITE_BUSY (locking) issues
		// caused by writing while a read cursor is open.
		type legacyKey struct {
			wID       string
			pubKey    string
			createdAt string
		}
		var keysToMigrate []legacyKey

		rows, err := db.Query("SELECT worker_id, public_key, created_at FROM worker_keys_legacy")
		if err != nil {
			log.Fatal("Failed to query legacy keys:", err)
		}

		for rows.Next() {
			var k legacyKey
			if err := rows.Scan(&k.wID, &k.pubKey, &k.createdAt); err != nil {
				log.Printf("⚠️ Error scanning row: %v", err)
				continue
			}
			keysToMigrate = append(keysToMigrate, k)
		}
		rows.Close() // CRITICAL: Close read cursor before writing

		migratedCount := 0
		for _, k := range keysToMigrate {
			// Compute key_id = SHA256(pubKey)
			hash := sha256.Sum256([]byte(k.pubKey))
			keyID := hex.EncodeToString(hash[:])

			_, err = db.Exec("INSERT INTO worker_keys (key_id, worker_id, public_key, created_at) VALUES (?, ?, ?, ?)",
				keyID, k.wID, k.pubKey, k.createdAt)

			if err != nil {
				log.Printf("⚠️ Failed to migrate key for worker %s: %v", k.wID, err)
			} else {
				migratedCount++
			}
		}
		log.Printf("✅ Migrated %d legacy worker keys", migratedCount)

	} else if isNewInstall {
		// New install - create table with new schema
		_, err = db.Exec(`
			CREATE TABLE IF NOT EXISTS worker_keys (
				key_id TEXT PRIMARY KEY,
				worker_id TEXT NOT NULL,
				public_key TEXT NOT NULL,
				revoked_at DATETIME,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`)
		if err != nil {
			log.Fatal(err)
		}
	}

	// ---------------------------------------------------------
	// RESUME / RETRY MIGRATION (Idempotent)
	// If the previous migration failed (e.g. database locked), keys might be missing.
	// We check if 'worker_keys_legacy' exists and backfill any missing keys.
	// ---------------------------------------------------------
	var legacyExists bool
	err = db.QueryRow("SELECT 1 FROM sqlite_master WHERE type='table' AND name='worker_keys_legacy'").Scan(&legacyExists)
	if err == nil && legacyExists {
		// Legacy table exists. Let's ensure all keys are migrated.
		log.Println("🔄 Checking/Resuming migration from worker_keys_legacy...")

		type legacyKeyRes struct {
			wID       string
			pubKey    string
			createdAt string
		}
		var keysToMigrate []legacyKeyRes

		rows, err := db.Query("SELECT worker_id, public_key, created_at FROM worker_keys_legacy")
		if err != nil {
			log.Printf("⚠️ Failed to query legacy keys for resume: %v", err)
		} else {
			for rows.Next() {
				var k legacyKeyRes
				if err := rows.Scan(&k.wID, &k.pubKey, &k.createdAt); err != nil {
					continue
				}
				keysToMigrate = append(keysToMigrate, k)
			}
			rows.Close()

			resumedCount := 0
			for _, k := range keysToMigrate {
				hash := sha256.Sum256([]byte(k.pubKey))
				keyID := hex.EncodeToString(hash[:])

				// USE INSERT OR IGNORE to skip already migrated keys
				// key_id is PRIMARY KEY, so duplicates will be ignored
				_, err = db.Exec("INSERT OR IGNORE INTO worker_keys (key_id, worker_id, public_key, created_at) VALUES (?, ?, ?, ?)",
					keyID, k.wID, k.pubKey, k.createdAt)

				if err == nil {
					resumedCount++
				}
			}
			log.Printf("✅ Resume check complete. Processed %d legacy keys.", resumedCount)
		}
	}
}
