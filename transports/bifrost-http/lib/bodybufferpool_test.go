package lib

import "testing"

func TestResolveBodyBufferPoolLimit(t *testing.T) {
	defaultLimit := DefaultBodyBufferPoolLimitBytes
	zero := 0
	negative := -1
	small := 1024
	large := 64 * 1024 * 1024

	cases := []struct {
		name string
		cfg  *ServerConfig
		max  int
		want int
	}{
		{name: "nil config uses default", cfg: nil, max: large, want: defaultLimit},
		{name: "unset uses default", cfg: &ServerConfig{}, max: large, want: defaultLimit},
		{name: "zero means unlimited", cfg: &ServerConfig{BodyBufferPoolLimitBytes: &zero}, max: large, want: BodyBufferPoolLimitDisabled},
		{name: "negative means unlimited", cfg: &ServerConfig{BodyBufferPoolLimitBytes: &negative}, max: large, want: BodyBufferPoolLimitDisabled},
		{name: "explicit value", cfg: &ServerConfig{BodyBufferPoolLimitBytes: &small}, max: large, want: small},
		{name: "clamped to max request body", cfg: &ServerConfig{BodyBufferPoolLimitBytes: &small}, max: 512, want: 512},
		{name: "default clamped to max request body", cfg: &ServerConfig{}, max: small, want: small},
		{name: "no clamp when max is zero", cfg: &ServerConfig{BodyBufferPoolLimitBytes: &small}, max: 0, want: small},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ResolveBodyBufferPoolLimit(tc.cfg, tc.max); got != tc.want {
				t.Fatalf("ResolveBodyBufferPoolLimit() = %d, want %d", got, tc.want)
			}
		})
	}
}
