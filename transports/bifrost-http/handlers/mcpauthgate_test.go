package handlers

import (
	"testing"

	"github.com/maximhq/bifrost/core/schemas"
	"github.com/valyala/fasthttp"
)

// TestRejectStdioMCPClientIfAuthBypassed covers the guard that stops a
// deployment with dashboard auth disabled from being turned into
// unauthenticated remote code execution through a stdio MCP client.
func TestRejectStdioMCPClientIfAuthBypassed(t *testing.T) {
	SetLogger(&mockLogger{})

	cases := []struct {
		name       string
		connType   schemas.MCPConnectionType
		bypassed   any
		wantReject bool
	}{
		{name: "stdio while auth bypassed", connType: schemas.MCPConnectionTypeSTDIO, bypassed: true, wantReject: true},
		{name: "stdio on an authenticated request", connType: schemas.MCPConnectionTypeSTDIO},
		{name: "stdio with an explicit false flag", connType: schemas.MCPConnectionTypeSTDIO, bypassed: false},
		{name: "http while auth bypassed", connType: schemas.MCPConnectionTypeHTTP, bypassed: true},
		{name: "sse while auth bypassed", connType: schemas.MCPConnectionTypeSSE, bypassed: true},
		{name: "inprocess while auth bypassed", connType: schemas.MCPConnectionTypeInProcess, bypassed: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := &fasthttp.RequestCtx{}
			if tc.bypassed != nil {
				ctx.SetUserValue(schemas.BifrostContextKeyAuthBypassed, tc.bypassed)
			}

			rejected := rejectStdioMCPClientIfAuthBypassed(ctx, string(tc.connType))
			if rejected != tc.wantReject {
				t.Fatalf("rejected = %v, want %v", rejected, tc.wantReject)
			}

			if tc.wantReject {
				if ctx.Response.StatusCode() != fasthttp.StatusForbidden {
					t.Fatalf("status = %d, want %d", ctx.Response.StatusCode(), fasthttp.StatusForbidden)
				}
				if len(ctx.Response.Body()) == 0 {
					t.Fatal("expected a client-visible error body")
				}
				return
			}

			if ctx.Response.StatusCode() != fasthttp.StatusOK {
				t.Fatalf("non-stdio request must not be rejected, status = %d", ctx.Response.StatusCode())
			}
			if len(ctx.Response.Body()) != 0 {
				t.Fatalf("non-stdio request must not get an error body, got %q", ctx.Response.Body())
			}
		})
	}
}
