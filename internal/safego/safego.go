// Package safego provides a Go() wrapper for background goroutines that
// recovers from panics, logs the offending stack, and either restarts or
// surfaces the failure — instead of letting an unhandled panic from a
// background worker take down the whole process.
//
// Usage:
//
//	safego.Go("alert-engine", func() { engine.Start(ctx) })
//	safego.Go("collectors", func() { collectors.Start(ctx) })
//
// Long-lived loops that should auto-restart on panic should use Loop:
//
//	safego.Loop(ctx, "icmp-poller", time.Second, func() { /* one tick */ })
package safego

import (
	"context"
	"runtime/debug"
	"time"

	"github.com/rs/zerolog/log"
)

// Go runs fn in a new goroutine with panic recovery. The name is used in
// the recovery log line so we can attribute crashes to the right worker.
func Go(name string, fn func()) {
	go func() {
		defer recoverAndLog(name)
		fn()
	}()
}

// Loop runs fn repeatedly until ctx is cancelled, with a panic-recovery
// barrier between iterations. A panic in one tick logs and gets retried
// after backoff; the caller doesn't have to write the recover dance.
func Loop(ctx context.Context, name string, backoff time.Duration, fn func()) {
	if backoff <= 0 {
		backoff = time.Second
	}
	go func() {
		for {
			if ctx.Err() != nil {
				return
			}
			runOnce(name, fn)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
		}
	}()
}

func runOnce(name string, fn func()) {
	defer recoverAndLog(name)
	fn()
}

func recoverAndLog(name string) {
	r := recover()
	if r == nil {
		return
	}
	log.Error().
		Str("worker", name).
		Interface("panic", r).
		Bytes("stack", debug.Stack()).
		Msg("background goroutine panicked; recovered")
}
