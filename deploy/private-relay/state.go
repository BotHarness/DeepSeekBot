package main

import (
	"bufio"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

const defaultHost = "default"

var (
	secretPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
	hostPattern   = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)
)

func digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func sameHash(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func randomHex(size int) string {
	data := make([]byte, size)
	rand.Read(data)
	return hex.EncodeToString(data)
}

type ownerState struct {
	Owner    string `json:"owner,omitempty"`
	Phone    string `json:"phone,omitempty"`
	Released bool   `json:"released,omitempty"`
}

func slotPath(directory, name string) string {
	if name == defaultHost {
		return filepath.Join(directory, "owner.json")
	}
	return filepath.Join(directory, "hosts", name+".json")
}

func loadSlots(directory string) (map[string]ownerState, error) {
	hosts := filepath.Join(directory, "hosts")
	if err := os.MkdirAll(hosts, 0700); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(hosts)
	if err != nil {
		return nil, err
	}
	names := []string{defaultHost}
	for _, entry := range entries {
		name, ok := strings.CutSuffix(entry.Name(), ".json")
		if ok && name != defaultHost && hostPattern.MatchString(name) {
			names = append(names, name)
		}
	}
	slots := make(map[string]ownerState)
	for _, name := range names {
		data, err := os.ReadFile(slotPath(directory, name))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		var state ownerState
		if json.Unmarshal(data, &state) != nil ||
			(!state.Released && (!secretPattern.MatchString(state.Owner) || !secretPattern.MatchString(state.Phone))) {
			return nil, fmt.Errorf("owner-state-invalid: %s", name)
		}
		if !state.Released {
			slots[name] = state
		}
	}
	return slots, nil
}

func readHostKeys(path string) (map[string]string, error) {
	keys := make(map[string]string)
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return keys, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	lines := bufio.NewScanner(file)
	for lines.Scan() {
		parts := strings.Fields(lines.Text())
		if len(parts) == 0 {
			continue
		}
		if len(parts) != 2 || parts[0] == defaultHost || !hostPattern.MatchString(parts[0]) ||
			!secretPattern.MatchString(parts[1]) {
			return nil, errors.New("host-keys-invalid")
		}
		keys[parts[0]] = parts[1]
	}
	return keys, lines.Err()
}

// A directory sync can fail after the new contents become visible.
type publishedFileError struct{ error }

func wasPublished(err error) bool {
	var published publishedFileError
	return errors.As(err, &published)
}

// Publish a complete file at once. Link gives claims and secrets exclusive creation.
func writeAtomic(path string, data []byte, mode os.FileMode, create bool) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".relay-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	err = file.Chmod(mode)
	if err == nil {
		_, err = file.Write(data)
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err := errors.Join(err, closeErr); err != nil {
		return err
	}
	var cleanupErr error
	if create {
		if err := os.Link(file.Name(), path); err != nil {
			return fmt.Errorf("create %s atomically (requires hard-link support): %w", path, err)
		}
		cleanupErr = os.Remove(file.Name())
	} else if err := os.Rename(file.Name(), path); err != nil {
		return err
	}
	// Windows does not support syncing a directory through os.File.Sync.
	if runtime.GOOS == "windows" {
		if cleanupErr != nil {
			return publishedFileError{cleanupErr}
		}
		return nil
	}
	directory, err := os.Open(filepath.Dir(path))
	if err != nil {
		return publishedFileError{errors.Join(err, cleanupErr)}
	}
	if err := errors.Join(directory.Sync(), directory.Close(), cleanupErr); err != nil {
		return publishedFileError{err}
	}
	return nil
}

func saveSlot(path string, state ownerState, create bool) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return writeAtomic(path, data, 0600, create)
}
