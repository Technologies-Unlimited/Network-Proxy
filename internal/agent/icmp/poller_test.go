package icmp

import (
	"errors"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"gorm.io/gorm"
)

// newPollerTestDB builds a fresh in-memory SQLite DB with the Device schema for
// asserting the poller's status/packet_loss persistence.
func newPollerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	if err := db.AutoMigrate(&models.Device{}); err != nil {
		t.Fatalf("migrate Device: %v", err)
	}
	return db
}

func reloadDevice(t *testing.T, db *gorm.DB, id string) models.Device {
	t.Helper()
	var d models.Device
	if err := db.First(&d, "id = ?", id).Error; err != nil {
		t.Fatalf("reload device %s: %v", id, err)
	}
	return d
}

// TestSetIntervalRetunesLiveCollector proves SetInterval actually mutates the
// value the run loop reads each cycle. Before the dynamic-interval refactor the
// ticker was fixed at Start and SetInterval was inert — a ThothOS polling
// template could never retune a running poller.
func TestSetIntervalRetunesLiveCollector(t *testing.T) {
	c := NewCollector(nil, nil)

	if got := c.GetInterval(); got != defaultICMPInterval {
		t.Fatalf("default interval = %s, want %s", got, defaultICMPInterval)
	}

	cases := []time.Duration{10 * time.Second, 90 * time.Second, 250 * time.Millisecond}
	for _, want := range cases {
		c.SetInterval(want)
		if got := c.GetInterval(); got != want {
			t.Errorf("after SetInterval(%s) GetInterval()=%s", want, got)
		}
	}

	// Zero/negative is a no-op guard (never busy-loops the poller).
	c.SetInterval(30 * time.Second)
	c.SetInterval(0)
	c.SetInterval(-5 * time.Second)
	if got := c.GetInterval(); got != 30*time.Second {
		t.Errorf("non-positive SetInterval changed interval to %s", got)
	}
}

func TestSetPingParams(t *testing.T) {
	c := NewCollector(nil, nil)
	gotCount, gotTimeout := c.pingParams()
	if gotCount != defaultPingCount || gotTimeout != defaultPingTimeout {
		t.Fatalf("defaults = (%d,%s), want (%d,%s)", gotCount, gotTimeout, defaultPingCount, defaultPingTimeout)
	}

	c.SetPingParams(2, 3*time.Second)
	if gotCount, gotTimeout = c.pingParams(); gotCount != 2 || gotTimeout != 3*time.Second {
		t.Fatalf("after SetPingParams = (%d,%s), want (2,3s)", gotCount, gotTimeout)
	}

	// Zero args leave each value unchanged.
	c.SetPingParams(0, 0)
	if gotCount, gotTimeout = c.pingParams(); gotCount != 2 || gotTimeout != 3*time.Second {
		t.Fatalf("zero SetPingParams changed values to (%d,%s)", gotCount, gotTimeout)
	}
}

func TestAddRemoveDeviceCount(t *testing.T) {
	c := NewCollector(nil, nil)
	if c.GetDeviceCount() != 0 {
		t.Fatalf("fresh collector has %d devices", c.GetDeviceCount())
	}

	c.AddDevice(&models.Device{ID: "d1", Hostname: "h1", IPAddress: "10.0.0.1"})
	c.AddDevice(&models.Device{ID: "d2", Hostname: "h2", IPAddress: "10.0.0.2"})
	if c.GetDeviceCount() != 2 {
		t.Fatalf("after 2 adds count=%d", c.GetDeviceCount())
	}

	// Re-adding the same ID must not double-count.
	c.AddDevice(&models.Device{ID: "d1", Hostname: "h1b", IPAddress: "10.0.0.9"})
	if c.GetDeviceCount() != 2 {
		t.Fatalf("re-add same id changed count to %d", c.GetDeviceCount())
	}

	c.RemoveDevice("d1")
	if c.GetDeviceCount() != 1 {
		t.Fatalf("after remove count=%d", c.GetDeviceCount())
	}
	c.RemoveDevice("does-not-exist") // no-op, no panic
	if c.GetDeviceCount() != 1 {
		t.Fatalf("remove of missing id changed count to %d", c.GetDeviceCount())
	}
}

// TestLossToStatus pins the packet-loss up/down decision. The old poller used a
// binary PacketsRecv>0 (so 75% loss read fully "up"); now up/down is derived
// from the loss threshold, and 100% loss is always down.
func TestLossToStatus(t *testing.T) {
	cases := []struct {
		loss, threshold float64
		want            string
	}{
		{0, 100, "up"},
		{75, 100, "up"},   // partial loss under a 100 threshold is up-but-degraded
		{100, 100, "down"}, // total loss is always down
		{25, 25, "down"},   // at threshold = down
		{24, 25, "up"},
		{50, 25, "down"}, // above a tightened threshold = down
		{0, 25, "up"},
	}
	for _, tc := range cases {
		if got := lossToStatus(tc.loss, tc.threshold); got != tc.want {
			t.Errorf("lossToStatus(%.0f, %.0f)=%q want %q", tc.loss, tc.threshold, got, tc.want)
		}
	}
}

func TestSetLossThreshold(t *testing.T) {
	c := NewCollector(nil, nil)
	if got := c.LossThreshold(); got != defaultLossThreshold {
		t.Fatalf("default loss threshold=%v want %v", got, defaultLossThreshold)
	}
	c.SetLossThreshold(25)
	if got := c.LossThreshold(); got != 25 {
		t.Errorf("after SetLossThreshold(25)=%v", got)
	}
	// Non-positive is ignored; >100 clamps to 100.
	c.SetLossThreshold(0)
	c.SetLossThreshold(-5)
	if got := c.LossThreshold(); got != 25 {
		t.Errorf("non-positive SetLossThreshold changed threshold to %v", got)
	}
	c.SetLossThreshold(150)
	if got := c.LossThreshold(); got != 100 {
		t.Errorf("SetLossThreshold(150) clamped to %v want 100", got)
	}
}

// TestDevicesDuePerDeviceInterval proves Device.ICMPInterval (a dead field
// before) actually throttles a device relative to the collector base cadence: a
// device with a longer per-device interval is skipped on cycles a base-cadence
// device is polled.
func TestDevicesDuePerDeviceInterval(t *testing.T) {
	c := NewCollector(nil, nil) // base interval 60s
	c.AddDevice(&models.Device{ID: "base", IPAddress: "10.0.0.1", ICMPInterval: 0})   // uses base cadence
	c.AddDevice(&models.Device{ID: "slow", IPAddress: "10.0.0.2", ICMPInterval: 300}) // 5-min cadence

	dueIDs := func(now time.Time) map[string]bool {
		ids := map[string]bool{}
		for _, d := range c.devicesDue(now) {
			ids[d.ID] = true
		}
		return ids
	}

	t0 := time.Now()

	// First cycle: never-polled → everything due.
	if ids := dueIDs(t0); !ids["base"] || !ids["slow"] {
		t.Fatalf("first cycle due=%v, want both base and slow", ids)
	}

	// +60s (one base cycle): base is due again, slow is NOT.
	ids := dueIDs(t0.Add(60 * time.Second))
	if !ids["base"] {
		t.Errorf("base not due after 60s (base cadence)")
	}
	if ids["slow"] {
		t.Errorf("slow due after only 60s (300s cadence)")
	}

	// +300s from t0: slow is finally due.
	ids = dueIDs(t0.Add(300 * time.Second))
	if !ids["slow"] {
		t.Errorf("slow not due after 300s (its cadence)")
	}
}

func TestIsPrivilegeError(t *testing.T) {
	cases := []struct {
		msg  string
		want bool
	}{
		{"", false},
		{"operation not permitted", true},
		{"socket: permission denied", true},
		{"listen ip4:icmp 127.0.0.1: socket: operation not permitted", true},
		{"connect: network unreachable", false},
		{"context deadline exceeded", false},
	}
	for _, tc := range cases {
		var err error
		if tc.msg != "" {
			err = errors.New(tc.msg)
		}
		if got := isPrivilegeError(err); got != tc.want {
			t.Errorf("isPrivilegeError(%q)=%v want %v", tc.msg, got, tc.want)
		}
	}
}

// TestRawSocketHealthState covers the collector's persistent-health surface used
// by the API /health handler.
func TestRawSocketHealthState(t *testing.T) {
	c := NewCollector(nil, nil)
	if !c.RawSocketAvailable() || c.HealthError() != nil {
		t.Fatalf("fresh collector should be healthy: avail=%v err=%v", c.RawSocketAvailable(), c.HealthError())
	}

	want := errors.New("ICMP raw socket unavailable (operation not permitted)")
	c.setRawSocketErr(want)
	if c.RawSocketAvailable() {
		t.Errorf("RawSocketAvailable=true after setRawSocketErr")
	}
	if c.HealthError() != want {
		t.Errorf("HealthError=%v want %v", c.HealthError(), want)
	}
	if !c.rawSocketUnavailable() {
		t.Errorf("rawSocketUnavailable=false after setRawSocketErr")
	}
}

// TestCheckPrivilegeRecordsHealthError proves the REAL detection path (not just
// the direct setter): checkPrivilege records a PERSISTENT health error when the
// raw-socket probe fails with a permission-class error, leaves the collector
// healthy on a non-permission glitch, and healthy on success. This is fix 3's
// "detect the privilege failure and surface it" — the old code warned once and
// then flipped every device to a false "down".
func TestCheckPrivilegeRecordsHealthError(t *testing.T) {
	origProbe := privilegeProbe
	t.Cleanup(func() { privilegeProbe = origProbe })

	// Permission-class failure => persistent health error, raw socket unavailable.
	privilegeProbe = func() error {
		return errors.New("listen ip4:icmp 127.0.0.1: socket: operation not permitted")
	}
	c := NewCollector(nil, nil)
	c.checkPrivilege()
	if c.RawSocketAvailable() {
		t.Errorf("RawSocketAvailable=true after a permission-class probe failure")
	}
	if err := c.HealthError(); err == nil {
		t.Fatalf("HealthError=nil after a permission-class probe failure; want a persistent error")
	}

	// A non-permission probe glitch must NOT be recorded as unhealthy (it would
	// otherwise suppress real down-recording for a genuine outage).
	privilegeProbe = func() error { return errors.New("connect: network unreachable") }
	c2 := NewCollector(nil, nil)
	c2.checkPrivilege()
	if !c2.RawSocketAvailable() || c2.HealthError() != nil {
		t.Errorf("non-permission probe error wrongly recorded unhealthy: avail=%v err=%v",
			c2.RawSocketAvailable(), c2.HealthError())
	}

	// A successful probe leaves the collector healthy.
	privilegeProbe = func() error { return nil }
	c3 := NewCollector(nil, nil)
	c3.checkPrivilege()
	if !c3.RawSocketAvailable() || c3.HealthError() != nil {
		t.Errorf("healthy probe recorded an error: avail=%v err=%v", c3.RawSocketAvailable(), c3.HealthError())
	}
}

// TestRecordLossAndStatusPersists proves packet loss is recorded to the device
// row and up/down is threshold-derived. This is the DB-side of "packet loss is
// real data".
func TestRecordLossAndStatusPersists(t *testing.T) {
	db := newPollerTestDB(t)
	c := NewCollector(nil, db) // nil metrics is fine — recordLossAndStatus guards it
	c.SetLossThreshold(25)

	// Degraded-but-up: 10% loss under a 25 threshold stays up, loss recorded.
	up := &models.Device{ID: "d-up", Hostname: "h-up", IPAddress: "10.0.0.1"}
	if err := db.Create(up).Error; err != nil {
		t.Fatalf("create device: %v", err)
	}
	c.recordLossAndStatus(up, 10)
	got := reloadDevice(t, db, "d-up")
	if got.Status != "up" {
		t.Errorf("status=%q want up (10%% loss under 25 threshold)", got.Status)
	}
	if got.PacketLoss != 10 {
		t.Errorf("packet_loss=%v want 10 (loss must be recorded, not discarded)", got.PacketLoss)
	}
	if got.LastSeen == nil {
		t.Errorf("last_seen not stamped on an up device")
	}

	// Over threshold: 50% loss under a 25 threshold is down.
	down := &models.Device{ID: "d-down", Hostname: "h-down", IPAddress: "10.0.0.2"}
	if err := db.Create(down).Error; err != nil {
		t.Fatalf("create device: %v", err)
	}
	c.recordLossAndStatus(down, 50)
	got = reloadDevice(t, db, "d-down")
	if got.Status != "down" {
		t.Errorf("status=%q want down (50%% loss over 25 threshold)", got.Status)
	}
	if got.PacketLoss != 50 {
		t.Errorf("packet_loss=%v want 50", got.PacketLoss)
	}
}

// TestRecordDownSuppressedWhenRawSocketUnavailable proves fix 3's "not silent
// all-down": when the raw socket is known-unavailable, recordDown records
// NOTHING (leaves the device unknown) instead of flipping it to a false down.
func TestRecordDownSuppressedWhenRawSocketUnavailable(t *testing.T) {
	db := newPollerTestDB(t)
	c := NewCollector(nil, db)

	dev := &models.Device{ID: "d-priv", Hostname: "h", IPAddress: "10.0.0.9", Status: "unknown"}
	if err := db.Create(dev).Error; err != nil {
		t.Fatalf("create device: %v", err)
	}

	// Healthy collector: a down IS recorded.
	c.recordDown(dev)
	if got := reloadDevice(t, db, "d-priv"); got.Status != "down" {
		t.Fatalf("healthy collector: status=%q want down", got.Status)
	}

	// Reset and mark the raw socket unavailable: recordDown must NOT overwrite
	// the status (stays as-is, "unknown" here) — no false all-down.
	db.Model(&models.Device{}).Where("id = ?", "d-priv").Update("status", "unknown")
	c.setRawSocketErr(errors.New("operation not permitted"))
	c.recordDown(dev)
	if got := reloadDevice(t, db, "d-priv"); got.Status != "unknown" {
		t.Errorf("privilege-down suppression failed: status=%q want unknown (not a false down)", got.Status)
	}
}

// TestRttMillisPreservesSubMillisecond pins the fractional-latency fix: a real
// sub-millisecond LAN RTT must NOT be recorded as 0ms (the old
// Duration.Milliseconds() truncation), so latency metrics and sub-1ms alert
// thresholds stay meaningful.
func TestRttMillisPreservesSubMillisecond(t *testing.T) {
	cases := []struct {
		name string
		rtt  time.Duration
		want float64
	}{
		{"400us", 400 * time.Microsecond, 0.4},
		{"900us", 900 * time.Microsecond, 0.9},
		{"1500us", 1500 * time.Microsecond, 1.5},
		{"12ms", 12 * time.Millisecond, 12.0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := rttMillis(tc.rtt)
			if got != tc.want {
				t.Errorf("rttMillis(%v)=%v want %v", tc.rtt, got, tc.want)
			}
			// Guard against a regression to integer truncation.
			if tc.rtt < time.Millisecond && got == 0 {
				t.Errorf("sub-millisecond RTT %v truncated to 0ms", tc.rtt)
			}
		})
	}
}
