package utils

import (
	"context"
	"errors"

	schemas "github.com/maximhq/bifrost/core/schemas"
)

// newStreamContextError maps an ended request context to the error the caller
// would have received had the provider produced it: 504 for a deadline, 499 for
// an explicit cancellation. Fallbacks are blocked because the caller is gone.
func newStreamContextError(ctx context.Context) *schemas.BifrostError {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return NewBifrostTimeoutError(schemas.ErrProviderRequestTimedOut, ctx.Err())
	}
	err := NewBifrostOperationError(schemas.ErrRequestCancelled, ctx.Err())
	statusCode := 499
	errorType := schemas.RequestCancelled
	allowFallbacks := false
	err.StatusCode = &statusCode
	err.Error.Type = &errorType
	err.AllowFallbacks = &allowFallbacks
	return err
}

// drainInBackground consumes stream until the producer closes it so a provider
// goroutine blocked on send can exit. The returned channel closes when the drain
// completes.
func drainInBackground(stream chan *schemas.BifrostStreamChunk) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		for range stream {
		}
	}()
	return done
}

// CheckFirstStreamChunkForError reads the first chunk from a streaming channel to detect
// errors returned inside HTTP 200 SSE streams (e.g., providers that send rate limit
// errors as SSE events instead of HTTP 429).
//
// If ctx ends before the first chunk arrives, it returns a RequestCancelled (499)
// or RequestTimedOut (504) error immediately and drains the source in the
// background, so the calling worker is released instead of waiting out the
// provider's stream idle timeout (maximhq/bifrost#6974). A chunk the producer
// already delivered takes precedence over ctx.
//
// If the first chunk is an error, it drains the source channel in the background
// (so the provider goroutine can exit cleanly) and returns the error for synchronous
// handling, enabling retries and fallbacks. The returned drainDone channel is closed
// once the drain completes — callers must wait on it before releasing any resources
// (e.g., plugin pipelines) that the provider goroutine's postHookRunner may still reference.
//
// If the first chunk is valid data, it returns a wrapped channel that re-emits
// the first chunk followed by all remaining chunks from the source. drainDone is
// closed when the wrapper goroutine finishes forwarding the source stream.
//
// If the source channel is closed immediately (empty stream), it returns a
// nil channel with nil error. drainDone is already closed.
//
// The ctx argument cancels the background forwarding goroutine if the consumer
// abandons the returned wrapped channel. On ctx.Done the goroutine drains the
// source stream so the upstream provider's blocked send can exit cleanly.
func CheckFirstStreamChunkForError(
	ctx context.Context,
	stream chan *schemas.BifrostStreamChunk,
) (chan *schemas.BifrostStreamChunk, <-chan struct{}, *schemas.BifrostError) {
	if stream == nil {
		done := make(chan struct{})
		close(done)
		return nil, done, nil
	}
	var firstChunk *schemas.BifrostStreamChunk
	var ok bool
	select {
	case firstChunk, ok = <-stream:
		// A chunk the producer already delivered wins over ctx: a provider
		// goroutine that saw the cancellation itself emits a richer
		// RequestCancelled chunk (billed usage, raw request) through
		// HandleStreamCancellation.
	default:
		select {
		case firstChunk, ok = <-stream:
		case <-ctx.Done():
			// The producer accepted the request but has emitted nothing and the
			// request is gone. Release the worker now instead of waiting out the
			// provider's stream idle timeout. Drain in the background so the
			// producer's eventual send and close still complete.
			return nil, drainInBackground(stream), newStreamContextError(ctx)
		}
	}
	if !ok {
		// Channel closed immediately (empty stream) — return nil so callers
		// can distinguish this from a live stream channel.
		done := make(chan struct{})
		close(done)
		return nil, done, nil
	}

	// Check if first chunk is an error
	if firstChunk.BifrostError != nil && firstChunk.BifrostError.Error != nil &&
		(firstChunk.BifrostError.Error.Message != "" || firstChunk.BifrostError.Error.Code != nil || firstChunk.BifrostError.Error.Type != nil) {
		// Drain source channel to let the provider goroutine exit cleanly
		return nil, drainInBackground(stream), firstChunk.BifrostError
	}

	// First chunk is valid data — wrap channel to re-inject it
	done := make(chan struct{})
	wrapped := make(chan *schemas.BifrostStreamChunk, max(cap(stream), 1))
	wrapped <- firstChunk
	go func() {
		defer close(done)
		defer close(wrapped)
		for chunk := range stream {
			select {
			case wrapped <- chunk:
			case <-ctx.Done():
				// Consumer abandoned the wrapped channel. Drain the source so the
				// provider's blocked send unblocks and its goroutine can exit.
				for range stream {
				}
				return
			}
		}
	}()
	return wrapped, done, nil
}
