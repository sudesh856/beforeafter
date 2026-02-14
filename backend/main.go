package main

import (
	"log"
	"math/rand"
	"net/http"
	"time"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

func main() {
	rand.Seed(time.Now().UnixNano())
	
	initDB()
	defer db.Close()

	router := mux.NewRouter()
	router.HandleFunc("/proofs", createProof).Methods("POST")
	router.HandleFunc("/proofs/{proofId}/pin", generatePin).Methods("POST")
	router.HandleFunc("/verify/{pin}", verifyPin).Methods("GET")
	router.HandleFunc("/workers/{workerId}/public-key", registerPublicKey).Methods("POST")

	handler := cors.Default().Handler(router)

	log.Println("Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}