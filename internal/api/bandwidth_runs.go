package api

import (
	"context"
	"sync"
)

// bandwidthRuns is a tiny registry mapping test IDs to their context cancel
// funcs. cancelBandwidthTest used to flip the DB status to "cancelled" but
// never touch the running goroutine — the upload/download streams kept
// chewing bandwidth until they hit their deadline. Now the cancel handler
// can actually stop the test.
var (
	bandwidthRunsMu sync.Mutex
	bandwidthRuns   = map[string]context.CancelFunc{}
)

// registerBandwidthRun records the cancel func for an in-flight test.
func registerBandwidthRun(testID string, cancel context.CancelFunc) {
	bandwidthRunsMu.Lock()
	defer bandwidthRunsMu.Unlock()
	bandwidthRuns[testID] = cancel
}

// unregisterBandwidthRun drops the entry once the test goroutine returns.
func unregisterBandwidthRun(testID string) {
	bandwidthRunsMu.Lock()
	defer bandwidthRunsMu.Unlock()
	delete(bandwidthRuns, testID)
}

// cancelBandwidthRun fires the cancel func for testID if one is registered.
// Returns true if a cancel was actually triggered, false if no in-flight
// run exists (e.g. the test already completed naturally).
func cancelBandwidthRun(testID string) bool {
	bandwidthRunsMu.Lock()
	defer bandwidthRunsMu.Unlock()
	cancel, ok := bandwidthRuns[testID]
	if !ok {
		return false
	}
	cancel()
	delete(bandwidthRuns, testID)
	return true
}
