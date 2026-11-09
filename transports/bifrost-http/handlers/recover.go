package handlers

import (
	"runtime/debug"

	"github.com/maximhq/bifrost/core/schemas"
	"github.com/valyala/fasthttp"
)

// PanicRecoveryMiddleware converts a panic raised while serving a request into a
// 500 response instead of letting it reach fasthttp. fasthttp performs no panic
// recovery of its own, so without this a single panicking handler takes the
// whole process down. It must be the outermost middleware so panics raised by
// the other middlewares are covered as well.
//
// A panic that happens after the response has been committed (a streaming body
// writer is already running, or the status/body was already set) cannot be
// turned into a clean 500; in that case the panic is logged and the connection
// is left to finish or close, because rewriting the status would corrupt the
// bytes the client already received.
func PanicRecoveryMiddleware() schemas.BifrostHTTPMiddleware {
	return func(next fasthttp.RequestHandler) fasthttp.RequestHandler {
		return func(ctx *fasthttp.RequestCtx) {
			defer func() {
				recovered := recover()
				if recovered == nil {
					return
				}
				if logger != nil {
					logger.Error("panic while handling %s %s: %v\n%s", ctx.Method(), ctx.Path(), recovered, debug.Stack())
				}
				if responseCommitted(ctx) {
					return
				}
				SendError(ctx, fasthttp.StatusInternalServerError, "internal server error")
			}()
			next(ctx)
		}
	}
}

// responseCommitted reports whether the handler already produced response bytes
// or chose a status code. Before that point a recovered panic can still be
// answered with a clean 500.
func responseCommitted(ctx *fasthttp.RequestCtx) bool {
	return ctx.Response.IsBodyStream() ||
		ctx.Response.StatusCode() != fasthttp.StatusOK ||
		len(ctx.Response.Body()) > 0
}
