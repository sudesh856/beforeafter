package main

import "time"

type Proof struct {
	ProofID   string    `json:"proofId"`
	KeyID     string    `json:"keyId,omitempty"`
	WorkerID  string    `json:"workerId"`
	Before    Evidence  `json:"before"`
	After     Evidence  `json:"after"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type Evidence struct {
	ImageHash string    `json:"imageHash"`
	ImageData string    `json:"imageData"`
	Timestamp time.Time `json:"timestamp"`
	GPS       GPS       `json:"gps"`
}

type GPS struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type PinResponse struct {
	Pin string `json:"pin"`
}

type VerifyResponse struct {
	Proof Proof `json:"proof"`
}
