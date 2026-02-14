package main

import (
	"database/sql"
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

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS worker_keys (
			worker_id TEXT PRIMARY KEY,
			public_key TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		log.Fatal(err)
	}
}
