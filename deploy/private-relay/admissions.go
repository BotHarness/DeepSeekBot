package main

import (
	"encoding/json"
	"log"
	"slices"
	"time"
)

const maxAdmissions = 1024

type admission struct {
	Hash      string `json:"hash"`
	ExpiresAt int64  `json:"expiresAt,omitempty"`
	Peer      bool   `json:"peer,omitempty"`
}

func validAdmissions(entries []admission) bool {
	if len(entries) > maxAdmissions {
		return false
	}
	seen := make(map[string]bool, len(entries))
	for _, entry := range entries {
		if !secretPattern.MatchString(entry.Hash) || entry.ExpiresAt < 0 ||
			(entry.Peer && entry.ExpiresAt != 0) || seen[entry.Hash] {
			return false
		}
		seen[entry.Hash] = true
	}
	return true
}

func (s ownerState) admits(hash string) bool {
	if !s.Managed {
		return sameHash(hash, s.Phone)
	}
	now := time.Now().UnixMilli()
	for _, entry := range s.Admissions {
		if sameHash(hash, entry.Hash) && (entry.ExpiresAt == 0 || entry.ExpiresAt > now) {
			return true
		}
	}
	return false
}

func (s ownerState) peerAdmission(hash string) bool {
	for _, entry := range s.Admissions {
		if entry.Peer && sameHash(hash, entry.Hash) {
			return true
		}
	}
	return false
}

// Serialize durable admission updates with claim/release. Admissions only become
// usable after the authenticated Host has synchronized this control session.
func (r *relay) replaceAdmissions(name string, host *liveHost, id string, body json.RawMessage) bool {
	var entries []admission
	if json.Unmarshal(body, &entries) != nil || entries == nil || !validAdmissions(entries) {
		return false
	}
	deadline := time.Now().Add(11 * time.Minute).UnixMilli()
	for _, entry := range entries {
		if entry.ExpiresAt > deadline {
			return false
		}
	}
	r.claimMu.Lock()
	defer r.claimMu.Unlock()
	r.mu.Lock()
	if r.live[name] != host {
		r.mu.Unlock()
		return false
	}
	previous := r.slots[name]
	needsSave := !host.admissionReady || !slices.Equal(previous.Admissions, entries)
	reserved := make(map[string]bool)
	for other, slot := range r.slots {
		reserved[slot.Owner] = true
		reserved[slot.Phone] = true
		if other != name {
			for _, entry := range slot.Admissions {
				reserved[entry.Hash] = true
			}
		}
	}
	for _, entry := range entries {
		if reserved[entry.Hash] {
			r.mu.Unlock()
			return false
		}
	}
	r.mu.Unlock()

	next := previous
	if !previous.Managed {
		next.Phone = randomHex(32) // Leave legacy readers with no known phone bearer.
	}
	next.Managed = true
	next.Admissions = entries
	var err error
	if needsSave {
		err = saveSlot(slotPath(r.directory, name), next, false)
	}
	if err != nil {
		log.Printf("persist relay admissions: %v", err)
		if !wasPublished(err) {
			return false
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.slots[name] = next
	if err != nil || r.live[name] != host {
		return false
	}
	for _, phone := range host.phones {
		if !phone.peerAdmission && !next.admits(phone.admissionHash) {
			phone.stop()
		}
	}
	host.admissionReady = true
	return host.control.send(message("admissions-ack", id))
}
