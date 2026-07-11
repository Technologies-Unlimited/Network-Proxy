package models

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"

	"github.com/rs/zerolog/log"
)

// fieldCrypto provides symmetric encryption for sensitive GORM fields (API
// keys, SNMP credentials, webhook secrets). The key is derived once per
// process from NETWORK_MONITOR_SECRET_KEY and cached.
//
// Ciphertext format: base64( "v1:" || nonce || ciphertext+tag )
// The "v1:" envelope prefix lets BeforeSave/AfterFind hooks distinguish
// already-encrypted values (e.g. when a row is loaded, mutated, and re-saved)
// from plaintext that still needs encryption.
type fieldCryptoState struct {
	aead   cipher.AEAD
	ready  bool
	keyErr error
}

var (
	fieldCrypto   fieldCryptoState
	fieldCryptoMu sync.Mutex
)

const encEnvelopePrefix = "v1:"

// NETWORK_MONITOR_SECRET_KEY_ENV is the env var name that supplies the
// at-rest encryption key. The value is any non-empty string; it is hashed
// through SHA-256 to produce a 32-byte AES-256 key, so operators can paste
// a long passphrase or a hex secret interchangeably.
const NETWORK_MONITOR_SECRET_KEY_ENV = "NETWORK_MONITOR_SECRET_KEY"

// loadFieldCrypto lazily builds the AEAD cipher. It returns (nil, nil) when
// no key is configured, which callers treat as "fail open to plaintext and
// log once" — that lets existing deployments keep working while operators
// provision the key. For fresh installs the startup log will tell them to
// set the env var.
func loadFieldCrypto() (cipher.AEAD, error) {
	fieldCryptoMu.Lock()
	defer fieldCryptoMu.Unlock()

	if fieldCrypto.ready {
		return fieldCrypto.aead, fieldCrypto.keyErr
	}
	fieldCrypto.ready = true

	raw := os.Getenv(NETWORK_MONITOR_SECRET_KEY_ENV)
	if raw == "" {
		// Leave aead=nil; callers fall back to plaintext.
		return nil, nil
	}

	sum := sha256.Sum256([]byte(raw))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		fieldCrypto.keyErr = fmt.Errorf("aes cipher: %w", err)
		return nil, fieldCrypto.keyErr
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		fieldCrypto.keyErr = fmt.Errorf("gcm: %w", err)
		return nil, fieldCrypto.keyErr
	}
	fieldCrypto.aead = gcm
	return gcm, nil
}

// EncryptField encrypts s with the process-wide field key. If no key is
// configured, returns s unchanged so the database still stores something
// readable — marked with no envelope prefix so DecryptField returns it as
// plaintext. Panicking here would brick a first-run install that hasn't
// set the key yet.
func EncryptField(s string) (string, error) {
	if s == "" {
		return "", nil
	}
	if hasEncEnvelope(s) {
		// Idempotent: value was loaded encrypted and re-saved without the
		// plaintext ever being touched by code (GORM does that on Save()).
		return s, nil
	}
	aead, err := loadFieldCrypto()
	if err != nil {
		return "", err
	}
	if aead == nil {
		return s, nil
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("nonce: %w", err)
	}
	ct := aead.Seal(nil, nonce, []byte(s), nil)
	payload := append(nonce, ct...)
	return encEnvelopePrefix + base64.StdEncoding.EncodeToString(payload), nil
}

// DecryptField is the inverse of EncryptField. Values missing the envelope
// prefix are returned as-is (legacy plaintext rows from before encryption
// was enabled).
//
// Fail-soft policy: if a row is encrypted but the key is missing or the
// ciphertext is corrupt, this returns the raw ciphertext-string and a nil
// error after logging once at Warn. The previous "return error" behaviour
// failed AfterFind on every read, so a single missing env var would brick
// the whole dashboard. Returning the envelope string keeps the row
// loadable; the caller will see a non-empty but unusable secret and the
// operator gets a loud log line instead of a blank UI.
func DecryptField(s string) (string, error) {
	if s == "" {
		return "", nil
	}
	if !hasEncEnvelope(s) {
		return s, nil
	}
	aead, err := loadFieldCrypto()
	if err != nil {
		warnDecryptFailureOnce("crypto load failed; secret unreadable", err)
		return s, nil
	}
	if aead == nil {
		warnDecryptFailureOnce(
			"NETWORK_MONITOR_SECRET_KEY missing but encrypted secret found in DB; returning ciphertext", nil)
		return s, nil
	}
	payload, err := base64.StdEncoding.DecodeString(s[len(encEnvelopePrefix):])
	if err != nil {
		warnDecryptFailureOnce("ciphertext base64 decode failed", err)
		return s, nil
	}
	if len(payload) < aead.NonceSize() {
		warnDecryptFailureOnce("ciphertext too short", nil)
		return s, nil
	}
	nonce, ct := payload[:aead.NonceSize()], payload[aead.NonceSize():]
	plain, err := aead.Open(nil, nonce, ct, nil)
	if err != nil {
		warnDecryptFailureOnce("AEAD open failed (wrong key?)", err)
		return s, nil
	}
	return string(plain), nil
}

// decryptWarnOnce ensures the operator-facing warning fires once per
// process lifetime even though DecryptField may be called thousands of
// times per second.
var decryptWarnOnce sync.Once

func warnDecryptFailureOnce(msg string, err error) {
	decryptWarnOnce.Do(func() {
		ev := log.Warn().Str("subsystem", "field-crypto")
		if err != nil {
			ev = ev.Err(err)
		}
		ev.Msg(msg + " — secrets will appear empty/garbled until resolved")
	})
}

// silence unused-import linter when build tags strip the log call. _ = log
// to keep the import even in odd builds. Currently always referenced.
var _ = errors.New

func hasEncEnvelope(s string) bool {
	return len(s) > len(encEnvelopePrefix) && s[:len(encEnvelopePrefix)] == encEnvelopePrefix
}

// CryptoKeyConfigured reports whether a field-encryption key is set. main.go
// logs a one-time warning at startup if this returns false so operators
// aren't surprised by plaintext secrets on disk.
func CryptoKeyConfigured() bool {
	aead, _ := loadFieldCrypto()
	return aead != nil
}
