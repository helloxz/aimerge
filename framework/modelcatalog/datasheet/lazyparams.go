package datasheet

import (
	"container/list"
	"context"
	"errors"
	"sync"
	"time"

	providerUtils "github.com/maximhq/bifrost/core/providers/utils"
	"github.com/maximhq/bifrost/framework/configstore"
)

const (
	// defaultLazyParamsCacheSize bounds how many model-parameter rows are kept
	// parsed in memory. A single row is small (a few hundred bytes), so this is
	// a latency cache, not a memory concern.
	defaultLazyParamsCacheSize = 512
	// defaultLazyParamsNegativeTTL suppresses repeated lookups for models that
	// have no datasheet row. The catalog changes at most once per sync.
	defaultLazyParamsNegativeTTL = 5 * time.Minute
	// defaultLazyParamsLookupTimeout bounds the per-miss DB query. The model
	// column is uniquely indexed, so a healthy SQLite/Postgres lookup is
	// sub-millisecond; the timeout only guards a wedged store.
	defaultLazyParamsLookupTimeout = 2 * time.Second
)

// lazyParamsEntry is one parsed datasheet row. notFound entries are cached for
// a short TTL so unknown/custom models do not hammer the database.
type lazyParamsEntry struct {
	model    string
	params   []string
	outputs  []string
	notFound bool
	expires  time.Time
}

// lazyParamsCall deduplicates concurrent first lookups for the same model.
type lazyParamsCall struct {
	done  chan struct{}
	entry *lazyParamsEntry
	epoch uint64
}

// lazyParamsCache is a small LRU with single-flight misses and an epoch used
// to discard lookups that started before an invalidation (sync/reload).
type lazyParamsCache struct {
	mu          sync.Mutex
	capacity    int
	items       map[string]*list.Element
	order       *list.List
	inflight    map[string]*lazyParamsCall
	negativeTTL time.Duration
	epoch       uint64
}

func newLazyParamsCache(capacity int) *lazyParamsCache {
	if capacity <= 0 {
		capacity = defaultLazyParamsCacheSize
	}
	return &lazyParamsCache{
		capacity:    capacity,
		items:       make(map[string]*list.Element, capacity),
		order:       list.New(),
		inflight:    make(map[string]*lazyParamsCall),
		negativeTTL: defaultLazyParamsNegativeTTL,
	}
}

// get returns a cached entry. Expired negative entries are removed.
func (c *lazyParamsCache) get(model string) (*lazyParamsEntry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	elem, ok := c.items[model]
	if !ok {
		return nil, false
	}
	entry := elem.Value.(*lazyParamsEntry)
	if entry.notFound && !entry.expires.IsZero() && time.Now().After(entry.expires) {
		c.order.Remove(elem)
		delete(c.items, model)
		return nil, false
	}
	c.order.MoveToFront(elem)
	return entry, true
}

// begin returns the in-flight call for model, or starts a new one and reports
// that the caller is the leader.
func (c *lazyParamsCache) begin(model string) (*lazyParamsCall, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if call, ok := c.inflight[model]; ok {
		return call, false
	}
	call := &lazyParamsCall{done: make(chan struct{}), epoch: c.epoch}
	c.inflight[model] = call
	return call, true
}

// finish publishes the leader's result to waiters and caches it when the
// lookup still belongs to the current epoch.
func (c *lazyParamsCache) finish(model string, call *lazyParamsCall, entry *lazyParamsEntry) {
	c.mu.Lock()
	call.entry = entry
	delete(c.inflight, model)
	if entry != nil && call.epoch == c.epoch {
		c.putLocked(entry)
	}
	c.mu.Unlock()
	close(call.done)
}

// putLocked inserts or refreshes an entry. Caller must hold c.mu.
func (c *lazyParamsCache) putLocked(entry *lazyParamsEntry) {
	if elem, ok := c.items[entry.model]; ok {
		elem.Value = entry
		c.order.MoveToFront(elem)
		return
	}
	if c.order.Len() >= c.capacity {
		if tail := c.order.Back(); tail != nil {
			c.order.Remove(tail)
			delete(c.items, tail.Value.(*lazyParamsEntry).model)
		}
	}
	c.items[entry.model] = c.order.PushFront(entry)
}

// invalidate drops every cached row and bumps the epoch so in-flight lookups
// cannot repopulate the cache with pre-sync data.
func (c *lazyParamsCache) invalidate() {
	c.mu.Lock()
	c.epoch++
	c.items = make(map[string]*list.Element, c.capacity)
	c.order.Init()
	c.mu.Unlock()
}

// lazyParamsForModel resolves one model's parameters, using the LRU first and
// the config store on a miss. Concurrent misses for the same model share one
// database query.
func (s *Store) lazyParamsForModel(model string) *lazyParamsEntry {
	if s.lazyCache == nil {
		return nil
	}
	if entry, ok := s.lazyCache.get(model); ok {
		return entry
	}

	call, leader := s.lazyCache.begin(model)
	if !leader {
		<-call.done
		return call.entry
	}
	entry := s.loadLazyParams(model)
	s.lazyCache.finish(model, call, entry)
	return entry
}

// loadLazyParams reads and parses a single datasheet row. A missing row is
// negative-cached; a database/parse error is not cached so a transient failure
// does not hide a row for the rest of the process lifetime.
func (s *Store) loadLazyParams(model string) *lazyParamsEntry {
	if s.configStore == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultLazyParamsLookupTimeout)
	defer cancel()

	row, err := s.configStore.GetModelParametersByModel(ctx, model)
	if err != nil {
		if errors.Is(err, configstore.ErrNotFound) {
			return &lazyParamsEntry{
				model:    model,
				notFound: true,
				expires:  time.Now().Add(defaultLazyParamsNegativeTTL),
			}
		}
		if s.logger != nil {
			s.logger.Warn("lazy model parameters: lookup %s failed: %v", model, err)
		}
		return nil
	}
	if row == nil {
		return &lazyParamsEntry{
			model:    model,
			notFound: true,
			expires:  time.Now().Add(defaultLazyParamsNegativeTTL),
		}
	}

	params, outputs, mp, err := s.parseModelParameterRow(model, []byte(row.Data))
	if err != nil {
		if s.logger != nil {
			s.logger.Warn("lazy model parameters: parse %s failed: %v", model, err)
		}
		return &lazyParamsEntry{
			model:    model,
			notFound: true,
			expires:  time.Now().Add(defaultLazyParamsNegativeTTL),
		}
	}
	if mp != nil {
		providerUtils.SetModelParams(model, *mp)
	}
	if s.logger != nil {
		s.logger.Debug("lazy model parameters: loaded %s from database", model)
	}
	return &lazyParamsEntry{model: model, params: params, outputs: outputs}
}
