package openai

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/maximhq/bifrost/core/schemas"
)

// heartbeatAfterFinishServer streams a content chunk and a finish chunk, then
// keeps the connection open with SSE keepalive comments until the client goes
// away or the test closes stop. It never sends [DONE].
func heartbeatAfterFinishServer(t *testing.T, finishReason string, stop <-chan struct{}) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher, _ := w.(http.Flusher)
		_, _ = w.Write([]byte(chatChunk("hello", nil)))
		_, _ = w.Write([]byte(chatChunk("", &finishReason)))
		if flusher != nil {
			flusher.Flush()
		}
		for {
			select {
			case <-r.Context().Done():
				return
			case <-stop:
				return
			default:
			}
			if _, err := w.Write([]byte(": ping\n\n")); err != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
			time.Sleep(10 * time.Millisecond)
		}
	}))
}

// TestChatStreamPostFinishHeartbeatsEnd is the regression for an upstream that
// omits [DONE] and only heartbeats after finish_reason. The stream must end
// promptly with its terminal chunk instead of pinning the worker forever.
func TestChatStreamPostFinishHeartbeatsEnd(t *testing.T) {
	stop := make(chan struct{})
	server := heartbeatAfterFinishServer(t, "stop", stop)
	defer func() {
		close(stop)
		server.CloseClientConnections()
		server.Close()
	}()

	provider := newStreamTestProvider(server.URL)
	stream, bifrostErr := provider.ChatCompletionStream(newStreamTestContext(), passthroughPostHook, nil, testKey(), basicChatRequest())
	if bifrostErr != nil {
		t.Fatalf("stream setup failed: %v", bifrostErr)
	}

	// Drain with a short local deadline instead of collectChunks: a regression
	// here means the stream never closes, and the test must not hold the
	// httptest handler open while the package test binary waits it out.
	chunksCh := make(chan []*schemas.BifrostStreamChunk, 1)
	go func() {
		var chunks []*schemas.BifrostStreamChunk
		for chunk := range stream {
			if chunk != nil {
				chunks = append(chunks, chunk)
			}
		}
		chunksCh <- chunks
	}()

	var chunks []*schemas.BifrostStreamChunk
	select {
	case chunks = <-chunksCh:
	case <-time.After(3 * time.Second):
		t.Fatal("stream did not end after post-finish heartbeats; the heartbeat termination is missing")
	}

	for i, chunk := range chunks {
		if chunk.BifrostError != nil {
			t.Fatalf("chunk %d unexpectedly carried an error: %+v", i, chunk.BifrostError)
		}
	}
	final := chunks[len(chunks)-1]
	if final.BifrostChatResponse == nil || len(final.BifrostChatResponse.Choices) == 0 ||
		final.BifrostChatResponse.Choices[0].FinishReason == nil ||
		*final.BifrostChatResponse.Choices[0].FinishReason != "stop" {
		t.Fatalf("expected a final chunk carrying finish_reason %q, got %+v", "stop", final.BifrostChatResponse)
	}
}
