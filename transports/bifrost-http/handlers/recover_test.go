package handlers

import (
	"testing"

	"github.com/valyala/fasthttp"
)

// TestPanicRecoveryMiddleware_Returns500 verifies that a panicking handler is
// answered with a clean 500 instead of taking the process down.
func TestPanicRecoveryMiddleware_Returns500(t *testing.T) {
	SetLogger(&mockLogger{})

	ctx := &fasthttp.RequestCtx{}
	ctx.Request.SetRequestURI("/boom")

	PanicRecoveryMiddleware()(func(*fasthttp.RequestCtx) {
		panic("boom")
	})(ctx)

	if ctx.Response.StatusCode() != fasthttp.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", ctx.Response.StatusCode(), fasthttp.StatusInternalServerError)
	}
	if len(ctx.Response.Body()) == 0 {
		t.Fatal("expected an error body")
	}
}

// TestPanicRecoveryMiddleware_LeavesCommittedResponse verifies that a panic
// raised after the response was committed does not rewrite the status or body.
func TestPanicRecoveryMiddleware_LeavesCommittedResponse(t *testing.T) {
	SetLogger(&mockLogger{})

	ctx := &fasthttp.RequestCtx{}

	PanicRecoveryMiddleware()(func(ctx *fasthttp.RequestCtx) {
		ctx.SetStatusCode(fasthttp.StatusCreated)
		ctx.SetBodyString("partial")
		panic("boom")
	})(ctx)

	if ctx.Response.StatusCode() != fasthttp.StatusCreated {
		t.Fatalf("status = %d, want %d", ctx.Response.StatusCode(), fasthttp.StatusCreated)
	}
	if string(ctx.Response.Body()) != "partial" {
		t.Fatalf("body = %q, want %q", ctx.Response.Body(), "partial")
	}
}
