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
