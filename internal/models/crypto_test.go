package models

import (
	"os"
	"strings"
	"testing"
)

// The field-crypto key is loaded once per process and cached, so set it before
// any crypto call in this package's test binary.
func init() {
	os.Setenv(NETWORK_MONITOR_SECRET_KEY_ENV, "test-passphrase-for-field-crypto")
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	if !CryptoKeyConfigured() {
		t.Fatal("expected crypto key to be configured in test")
	}
	plain := "tk_super_secret_api_key_value"
	enc, err := EncryptField(plain)
	if err != nil {
		t.Fatalf("EncryptField: %v", err)
	}
	if enc == plain {
		t.Fatal("ciphertext equals plaintext — not encrypted")
	}
	if !strings.HasPrefix(enc, encEnvelopePrefix) {
		t.Errorf("ciphertext missing envelope prefix: %q", enc)
	}
	dec, err := DecryptField(enc)
	if err != nil {
		t.Fatalf("DecryptField: %v", err)
	}
	if dec != plain {
		t.Errorf("round trip mismatch: got %q want %q", dec, plain)
	}
}

func TestEncryptIsIdempotentOnCiphertext(t *testing.T) {
	enc, _ := EncryptField("secret")
	// Re-encrypting an already-enveloped value must be a no-op (GORM re-saves
	// rows whose plaintext was never touched).
	enc2, err := EncryptField(enc)
	if err != nil {
		t.Fatalf("EncryptField(ciphertext): %v", err)
	}
	if enc2 != enc {
		t.Error("re-encrypting ciphertext changed it (should be idempotent)")
	}
}

func TestDecryptPlaintextPassthrough(t *testing.T) {
	// Legacy rows stored before encryption have no envelope prefix and must
	// pass through unchanged.
	out, err := DecryptField("legacy-plaintext-value")
	if err != nil {
		t.Fatalf("DecryptField(plaintext): %v", err)
	}
	if out != "legacy-plaintext-value" {
		t.Errorf("plaintext passthrough mangled: %q", out)
	}
}

func TestEncryptEmptyString(t *testing.T) {
	if out, err := EncryptField(""); err != nil || out != "" {
		t.Errorf("empty encrypt = %q,%v", out, err)
	}
	if out, err := DecryptField(""); err != nil || out != "" {
		t.Errorf("empty decrypt = %q,%v", out, err)
	}
}

func TestProxyConfigEncryptionHooks(t *testing.T) {
	// The BeforeSave hook encrypts APIKey/WebhookSecret in place; AfterSave
	// restores plaintext. Exercise the hook functions directly.
	cfg := &ProxyConfig{APIKey: "tk_abc123", WebhookSecret: "whsec_xyz"}
	if err := cfg.BeforeSave(nil); err != nil {
		t.Fatalf("BeforeSave: %v", err)
	}
	if !strings.HasPrefix(cfg.APIKey, encEnvelopePrefix) {
		t.Errorf("APIKey not encrypted by BeforeSave: %q", cfg.APIKey)
	}
	// Simulate load: AfterFind should decrypt back to plaintext.
	if err := cfg.AfterFind(nil); err != nil {
		t.Fatalf("AfterFind: %v", err)
	}
	if cfg.APIKey != "tk_abc123" || cfg.WebhookSecret != "whsec_xyz" {
		t.Errorf("AfterFind did not restore plaintext: %+v", cfg)
	}
}
