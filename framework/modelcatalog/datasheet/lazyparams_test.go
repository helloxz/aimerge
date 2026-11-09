package datasheet

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/maximhq/bifrost/core/schemas"
	"github.com/maximhq/bifrost/framework/configstore"
	configstoreTables "github.com/maximhq/bifrost/framework/configstore/tables"
	"github.com/stretchr/testify/require"
)

// fakeParamsStore embeds the ConfigStore interface so tests only need to
// implement the one method the lazy path calls. Any accidental call to a bulk
// method (e.g. GetModelParameters) panics on the nil embedded interface, which
// is exactly what the "lazy mode must not bulk read" test wants.
type fakeParamsStore struct {
	configstore.ConfigStore

	mu      sync.Mutex
	rows    map[string]string
	lookups int
	err     error
	delay   time.Duration
}

func (f *fakeParamsStore) GetModelParametersByModel(ctx context.Context, model string) (*configstoreTables.TableModelParameters, error) {
	f.mu.Lock()
	f.lookups++
	err := f.err
	delay := f.delay
	f.mu.Unlock()

	if delay > 0 {
		time.Sleep(delay)
	}
	if err != nil {
		return nil, err
	}
	data, ok := f.rows[model]
	if !ok {
		return nil, configstore.ErrNotFound
	}
	return &configstoreTables.TableModelParameters{Model: model, Data: data}, nil
}

func (f *fakeParamsStore) lookupCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.lookups
}

const lazyTestModel = "test/lazy-vision"

const lazyTestRow = `{
  "mode": "chat",
  "provider": "test",
  "supported_endpoints": ["/v1/chat/completions", "/v1/responses"],
  "model_parameters": [{"id": "temperature"}, {"id": "top_p"}, {"id": "max_tokens"}],
  "supports_function_calling": true,
  "supports_reasoning": true,
  "max_output_tokens": 4096
}`

func newLazyTestStore(t *testing.T, store *fakeParamsStore) *Store {
	t.Helper()
	s := New(store, nil, Config{LazyParams: true})
	require.True(t, s.LazyParams())
	return s
}

func newFullTestStore(t *testing.T, data map[string]string) *Store {
	t.Helper()
	s := New(&fakeParamsStore{rows: data}, nil, Config{})
	raw := make(map[string]json.RawMessage, len(data))
	for model, row := range data {
		raw[model] = json.RawMessage(row)
	}
	s.applyModelParameters(raw)
	return s
}

func TestLazyParamsMatchesBulkIndex(t *testing.T) {
	data := map[string]string{lazyTestModel: lazyTestRow}
	full := newFullTestStore(t, data)
	lazy := newLazyTestStore(t, &fakeParamsStore{rows: data})

	require.Equal(t, full.GetSupportedParameters(lazyTestModel), lazy.GetSupportedParameters(lazyTestModel))

	for _, rt := range []schemas.RequestType{
		schemas.ChatCompletionRequest,
		schemas.ChatCompletionStreamRequest,
		schemas.ResponsesRequest,
		schemas.ResponsesStreamRequest,
		schemas.EmbeddingRequest,
		schemas.TextCompletionRequest,
	} {
		require.Equal(t,
			full.IsRequestTypeSupported(lazyTestModel, rt),
			lazy.IsRequestTypeSupported(lazyTestModel, rt),
			"request type %s", rt)
	}
}

func TestLazyParamsCachesLookup(t *testing.T) {
	store := &fakeParamsStore{rows: map[string]string{lazyTestModel: lazyTestRow}}
	s := newLazyTestStore(t, store)

	first := s.GetSupportedParameters(lazyTestModel)
	second := s.GetSupportedParameters(lazyTestModel)
	require.NotEmpty(t, first)
	require.Equal(t, first, second)
	require.Equal(t, 1, store.lookupCount(), "second call must be served from the LRU")
}

func TestLazyParamsSingleflight(t *testing.T) {
	store := &fakeParamsStore{
		rows:  map[string]string{lazyTestModel: lazyTestRow},
		delay: 20 * time.Millisecond,
	}
	s := newLazyTestStore(t, store)

	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_ = s.GetSupportedParameters(lazyTestModel)
		}()
	}
	close(start)
	wg.Wait()

	require.Equal(t, 1, store.lookupCount(), "concurrent first lookups must share one query")
}

func TestLazyParamsNegativeCache(t *testing.T) {
	store := &fakeParamsStore{rows: map[string]string{}}
	s := newLazyTestStore(t, store)

	require.Nil(t, s.GetSupportedParameters("test/missing"))
	require.Nil(t, s.GetSupportedParameters("test/missing"))
	require.False(t, s.IsRequestTypeSupported("test/missing", schemas.ChatCompletionRequest))
	require.Equal(t, 1, store.lookupCount(), "negative lookups must be cached")
}

func TestLazyParamsInvalidate(t *testing.T) {
	store := &fakeParamsStore{rows: map[string]string{lazyTestModel: lazyTestRow}}
	s := newLazyTestStore(t, store)

	require.NotEmpty(t, s.GetSupportedParameters(lazyTestModel))
	require.Equal(t, 1, store.lookupCount())

	s.InvalidateParamsCache()
	require.NotEmpty(t, s.GetSupportedParameters(lazyTestModel))
	require.Equal(t, 2, store.lookupCount(), "invalidation must force a fresh lookup")
}

func TestLazyParamsBulkLoadIsSkipped(t *testing.T) {
	store := &fakeParamsStore{rows: map[string]string{lazyTestModel: lazyTestRow}}
	s := newLazyTestStore(t, store)

	n, err := s.LoadModelParamsFromDB(context.Background())
	require.NoError(t, err)
	require.Equal(t, 0, n)
	require.Equal(t, 0, store.lookupCount(), "lazy mode must not read the database at startup")
}

func TestLazyParamsDBErrorIsNotCached(t *testing.T) {
	store := &fakeParamsStore{rows: map[string]string{}, err: errors.New("db unavailable")}
	s := newLazyTestStore(t, store)

	require.Nil(t, s.GetSupportedParameters(lazyTestModel))
	require.Nil(t, s.GetSupportedParameters(lazyTestModel))
	require.Equal(t, 2, store.lookupCount(), "errors must not be negative-cached")
}

func TestLazyParamsMalformedRowIsNegativeCached(t *testing.T) {
	store := &fakeParamsStore{rows: map[string]string{lazyTestModel: `{not json`}}
	s := newLazyTestStore(t, store)

	require.Nil(t, s.GetSupportedParameters(lazyTestModel))
	require.Nil(t, s.GetSupportedParameters(lazyTestModel))
	require.Equal(t, 1, store.lookupCount(), "a malformed row must not be re-parsed on every request")
}

func TestLazyParamsLRUEviction(t *testing.T) {
	rows := make(map[string]string, defaultLazyParamsCacheSize+8)
	for i := 0; i < defaultLazyParamsCacheSize+8; i++ {
		rows[fmt.Sprintf("%s-%03d", lazyTestModel, i)] = lazyTestRow
	}
	s := newLazyTestStore(t, &fakeParamsStore{rows: rows})
	for model := range rows {
		require.NotEmpty(t, s.GetSupportedParameters(model))
	}

	s.lazyCache.mu.Lock()
	defer s.lazyCache.mu.Unlock()
	require.LessOrEqual(t, s.lazyCache.order.Len(), defaultLazyParamsCacheSize)
}
