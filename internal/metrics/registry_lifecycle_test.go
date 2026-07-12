package metrics

import (
	"reflect"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

// This file is the surface-covering resource-leak gate for the Prometheus
// registry. Per-device metric series (children of a *Vec keyed in part by
// device_id) are created as devices are polled but were NEVER deleted when a
// device was removed or its identifying labels changed on edit — so /metrics
// (and process RSS) grew without bound as devices churned. The fix is a single
// drain point, Registry.ForgetDevice; these tests prove it drains EVERY
// per-device Vec, enumerated by reflection so a newly-added per-device metric is
// automatically covered.

// variableLabelNames extracts the variable label names from a collector's first
// Desc. client_golang v1.23 renders them as:
//
//	Desc{fqName: "...", ..., variableLabels: {device_id,ip_address,hostname}}
func variableLabelNames(t *testing.T, c prometheus.Collector) []string {
	t.Helper()
	ch := make(chan *prometheus.Desc, 4)
	c.Describe(ch)
	close(ch)
	d := <-ch
	if d == nil {
		t.Fatalf("collector produced no Desc")
	}
	s := d.String()
	const marker = "variableLabels: {"
	i := strings.Index(s, marker)
	if i < 0 {
		return nil
	}
	rest := s[i+len(marker):]
	j := strings.Index(rest, "}")
	if j < 0 {
		return nil
	}
	inner := strings.TrimSpace(rest[:j])
	if inner == "" {
		return nil
	}
	parts := strings.Split(inner, ",")
	for k := range parts {
		parts[k] = strings.TrimSpace(parts[k])
	}
	return parts
}

func hasLabel(labels []string, name string) bool {
	for _, l := range labels {
		if l == name {
			return true
		}
	}
	return false
}

// TestForgetDeviceDrainsEveryPerDeviceSeries walks every *prometheus.GaugeVec /
// *CounterVec field on *Registry by reflection; for each whose label set
// includes device_id it records a synthetic child, confirms the child exists,
// calls ForgetDevice, and asserts the child is gone. Because the surface is
// enumerated by reflection, ANY newly-added per-device Vec is covered
// automatically: add a per-device metric and forget to wire it into
// ForgetDevice and this test fails.
func TestForgetDeviceDrainsEveryPerDeviceSeries(t *testing.T) {
	const dev = "gate-forget-device-xyz"

	rv := reflect.ValueOf(reg).Elem()
	rt := rv.Type()

	perDeviceVecs := 0
	for i := 0; i < rt.NumField(); i++ {
		fv := rv.Field(i)
		if !fv.CanInterface() {
			continue // unexported field (mutex, sampledStatus, …)
		}
		coll, ok := fv.Interface().(prometheus.Collector)
		if !ok || fv.IsNil() {
			continue
		}
		// Only *Vec collectors expose WithLabelValues (and DeletePartialMatch);
		// skip scalar/other collectors.
		wlv := fv.MethodByName("WithLabelValues")
		if !wlv.IsValid() {
			continue
		}
		labels := variableLabelNames(t, coll)
		if !hasLabel(labels, "device_id") {
			continue // per-agent (agent_id) or otherwise non-per-device Vec
		}
		perDeviceVecs++
		fieldName := rt.Field(i).Name

		// Build label values: device_id gets our synthetic id, every other label
		// a fixed dummy. WithLabelValues auto-creates the child.
		args := make([]reflect.Value, len(labels))
		for k, l := range labels {
			v := "x"
			if l == "device_id" {
				v = dev
			}
			args[k] = reflect.ValueOf(v)
		}

		baseline := testutil.CollectAndCount(coll)
		wlv.Call(args) // instantiate the child series
		if got := testutil.CollectAndCount(coll); got != baseline+1 {
			t.Fatalf("%s: synthetic child not created (count %d, want %d)", fieldName, got, baseline+1)
		}

		reg.ForgetDevice(dev)

		if got := testutil.CollectAndCount(coll); got != baseline {
			t.Errorf("%s: ForgetDevice did not drain the per-device series (count %d, want baseline %d) — wire this Vec into Registry.ForgetDevice",
				fieldName, got, baseline)
		}
	}

	if perDeviceVecs == 0 {
		t.Fatalf("reflection found no per-device Vecs on *Registry — the gate is not covering anything")
	}
}

// TestForgetDeviceClearsSampledStatus proves ForgetDevice also drains the
// sampledStatus set, which otherwise leaks one entry per removed device.
func TestForgetDeviceClearsSampledStatus(t *testing.T) {
	const dev = "gate-sampled-status-abc"
	reg.RecordDeviceStatus(dev, "10.1.2.3", 1)
	if !reg.HasStatusSample(dev) {
		t.Fatalf("precondition: HasStatusSample=false after RecordDeviceStatus")
	}
	reg.ForgetDevice(dev)
	if reg.HasStatusSample(dev) {
		t.Errorf("ForgetDevice left the sampledStatus entry — the map leaks one entry per removed device")
	}
}
