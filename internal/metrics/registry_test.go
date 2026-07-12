package metrics

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

// NewRegistry registers on the global Prometheus registry via promauto, so it
// can only be built once per test binary — all assertions share this instance.
var reg = NewRegistry()

func TestRecordDeviceStatus(t *testing.T) {
	reg.RecordDeviceStatus("dev-1", "10.0.0.1", 1)
	g := reg.DeviceStatus.WithLabelValues("dev-1", "10.0.0.1", "")
	if v := testutil.ToFloat64(g); v != 1 {
		t.Errorf("device status gauge=%v want 1", v)
	}
	reg.RecordDeviceStatus("dev-1", "10.0.0.1", 0)
	if v := testutil.ToFloat64(g); v != 0 {
		t.Errorf("device status gauge=%v want 0 after down", v)
	}
}

func TestRecordPingSuccessAndFailure(t *testing.T) {
	reg.RecordPingSuccess("dev-2", "10.0.0.2", 12.5)
	if v := testutil.ToFloat64(reg.PingLatency.WithLabelValues("dev-2", "10.0.0.2")); v != 12.5 {
		t.Errorf("ping latency=%v want 12.5", v)
	}
	if v := testutil.ToFloat64(reg.PingSuccess.WithLabelValues("dev-2", "10.0.0.2")); v != 1 {
		t.Errorf("ping success counter=%v want 1", v)
	}
	reg.RecordPingFailure("dev-2", "10.0.0.2")
	reg.RecordPingFailure("dev-2", "10.0.0.2")
	if v := testutil.ToFloat64(reg.PingFailure.WithLabelValues("dev-2", "10.0.0.2")); v != 2 {
		t.Errorf("ping failure counter=%v want 2", v)
	}
}

func TestRecordSNMPValue(t *testing.T) {
	reg.RecordSNMPValue("dev-3", "10.0.0.3", "ifInOctets", 4242)
	if v := testutil.ToFloat64(reg.SNMPValue.WithLabelValues("dev-3", "10.0.0.3", "ifInOctets")); v != 4242 {
		t.Errorf("snmp value=%v want 4242", v)
	}
}

func TestRecordPacketLoss(t *testing.T) {
	reg.RecordPacketLoss("dev-loss", "10.0.0.5", 42.5)
	if v := testutil.ToFloat64(reg.PacketLoss.WithLabelValues("dev-loss", "10.0.0.5")); v != 42.5 {
		t.Errorf("packet loss gauge=%v want 42.5", v)
	}
}

// TestHasStatusSampleAndErrNoSample is the never-polled fix: a device with no
// recorded status must report HasStatusSample=false, and the LocalQuerier must
// return ErrNoSample for it — NOT the phantom 0 that GaugeVec.WithLabelValues
// auto-creates (which read as "down" and fired false Device Down alerts). Once a
// real status is recorded, the querier returns the true value.
func TestHasStatusSampleAndErrNoSample(t *testing.T) {
	q := NewLocalQuerier(reg)

	const neverID = "dev-never-polled"
	if reg.HasStatusSample(neverID) {
		t.Fatalf("HasStatusSample=true for a never-recorded device")
	}
	if _, err := q.DeviceStatus(neverID, "10.0.0.99"); err != ErrNoSample {
		t.Errorf("DeviceStatus(never-polled) err=%v want ErrNoSample", err)
	}
	if _, err := q.PingLatency(neverID, "10.0.0.99"); err != ErrNoSample {
		t.Errorf("PingLatency(never-polled) err=%v want ErrNoSample", err)
	}
	if _, err := q.PacketLoss(neverID, "10.0.0.99"); err != ErrNoSample {
		t.Errorf("PacketLoss(never-polled) err=%v want ErrNoSample", err)
	}

	// A real down sample (value 0) must be distinguishable from "no sample": it
	// resolves to a genuine 0 with no error.
	reg.RecordDeviceStatus(neverID, "10.0.0.99", 0)
	if !reg.HasStatusSample(neverID) {
		t.Fatalf("HasStatusSample=false after RecordDeviceStatus")
	}
	v, err := q.DeviceStatus(neverID, "10.0.0.99")
	if err != nil || v != 0 {
		t.Errorf("DeviceStatus(polled-down)=%v,%v want 0,nil", v, err)
	}
}

// TestPingCountsRealAvailability backs the uptime fix: uptime% is computed from
// the REAL success/failure ping counters, never a hardcoded 99.9. A never-polled
// device returns ErrNoSample (so the API/report can honestly say "no data"); a
// polled device returns its true cumulative counts, from which availability is a
// genuine ratio.
func TestPingCountsRealAvailability(t *testing.T) {
	q := NewLocalQuerier(reg)

	const neverID = "dev-counts-never"
	if _, _, err := q.PingCounts(neverID, "10.0.0.77"); err != ErrNoSample {
		t.Errorf("PingCounts(never-polled) err=%v want ErrNoSample", err)
	}

	// Record a real status sample (as the poller does on every poll) plus a mix
	// of successes and failures, then confirm the counts are the true values.
	const id = "dev-counts"
	const ip = "10.0.0.78"
	reg.RecordDeviceStatus(id, ip, 1)
	reg.RecordPingSuccess(id, ip, 5.0)
	reg.RecordPingSuccess(id, ip, 6.0)
	reg.RecordPingSuccess(id, ip, 7.0)
	reg.RecordPingFailure(id, ip)

	success, failure, err := q.PingCounts(id, ip)
	if err != nil {
		t.Fatalf("PingCounts(polled) err=%v want nil", err)
	}
	if success != 3 || failure != 1 {
		t.Fatalf("PingCounts=%v,%v want 3,1", success, failure)
	}
	uptime := success / (success + failure) * 100
	if uptime != 75 {
		t.Errorf("derived availability=%v%% want 75%%", uptime)
	}
}
