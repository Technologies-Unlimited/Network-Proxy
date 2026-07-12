package a

import "sync/atomic"

// counters mirrors the real BandwidthTest shape: some int64 fields are meant to
// be touched only through sync/atomic.
type counters struct {
	good  int64 // always accessed atomically -> OK
	bad   int64 // atomic write, plain read/write elsewhere -> RED
	plain int64 // never atomic -> out of class, ignored
}

// writeGood/readGood are the CORRECT pattern: every access is atomic. The
// analyzer MUST stay silent here.
func writeGood(c *counters, n int64) {
	atomic.AddInt64(&c.good, n)
}

func readGood(c *counters) int64 {
	return atomic.LoadInt64(&c.good)
}

// writeBad is an atomic writer of `bad`, which makes `bad` an atomic field.
func writeBad(c *counters, n int64) {
	atomic.AddInt64(&c.bad, n)
}

// readBad reads the atomic field PLAINLY — a data race with writeBad. RED.
func readBad(c *counters) int64 {
	return c.bad // want `field bad is accessed via sync/atomic elsewhere`
}

// assignBad writes the atomic field PLAINLY — also a data race. RED.
func assignBad(c *counters) {
	c.bad = 0 // want `field bad is accessed via sync/atomic elsewhere`
}

// usePlain touches a field that is never atomic — the analyzer MUST ignore it, or
// the gate becomes a false-positive machine.
func usePlain(c *counters) int64 {
	c.plain = 5
	return c.plain
}

// other has its own `bad` field that is NEVER atomic. Keying on the field object
// (not the name) means this must NOT be flagged even though it shares the name.
type other struct {
	bad int64
}

func useOther(o *other) int64 {
	o.bad = 7
	return o.bad
}
