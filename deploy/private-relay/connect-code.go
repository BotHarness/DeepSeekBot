package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/skip2/go-qrcode"
	"golang.org/x/term"
)

const connectCodePrefix = "tobs-relay-v1:"

type connectCodeRecord struct {
	Hash      string    `json:"hash"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func connectCodePath(hosts, name string) string {
	return filepath.Join(hosts, "connect-codes", name+".json")
}

func readConnectCode(hosts, name string) (connectCodeRecord, error) {
	var record connectCodeRecord
	data, err := os.ReadFile(connectCodePath(hosts, name))
	if err != nil {
		return record, err
	}
	if json.Unmarshal(data, &record) != nil || !secretPattern.MatchString(record.Hash) || record.ExpiresAt.IsZero() {
		return record, errors.New("connect code record is invalid")
	}
	return record, nil
}

func mintConnectCode(keysPath, identity, name string, ttl time.Duration, reissue bool) (string, error) {
	hosts := filepath.Dir(keysPath)
	path := connectCodePath(hosts, name)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return "", err
	}
	_, err := readConnectCode(hosts, name)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	exists := err == nil
	if !exists && name != defaultHost {
		keys, err := readHostKeys(keysPath)
		if err != nil {
			return "", err
		}
		exists = keys[name] != ""
	}
	if exists && !reissue {
		return "", fmt.Errorf("Host already exists; run tobs-relay add-host --reissue %s for an unclaimed Host", name)
	}
	if !exists && reissue && name != defaultHost {
		return "", errors.New("Host does not exist; run tobs-relay add-host NAME")
	}
	token := randomHex(32)
	record := connectCodeRecord{Hash: digest(token), ExpiresAt: time.Now().Add(ttl).UTC()}
	data, err := json.Marshal(record)
	if err != nil {
		return "", err
	}
	if err := writeAtomic(path, data, 0644, !reissue); err != nil {
		return "", err
	}
	return connectCodePrefix + httpsOrigin(identity) + "#" + name + "." + token, nil
}

func printConnectCode(code string) error {
	fmt.Fprintln(os.Stderr, "Keep this one-time connect code private. Paste it into Connections → Docker relay.")
	if _, err := fmt.Fprintln(os.Stdout, code); err != nil {
		return err
	}
	if !term.IsTerminal(int(os.Stdout.Fd())) {
		return nil
	}
	qr, err := qrcode.New(code, qrcode.Medium)
	if err != nil {
		return errors.New("could not render connect code QR")
	}
	_, err = fmt.Fprint(os.Stdout, qr.ToSmallString(false))
	return err
}

func splitConnectCredential(value string) (name, token string, valid bool) {
	name, token, found := strings.Cut(value, ".")
	return name, token, found && hostPattern.MatchString(name) && secretPattern.MatchString(token)
}
