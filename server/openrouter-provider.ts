// The provider-routing rules EVERY OpenRouter chat call must send, in one place so no call site can
// quietly ship without them. Missing these is exactly what left the ideas and taste-distill calls
// hanging: routed to a provider that answers fast but generates slowly, a non-streamed reply gets
// buffered whole behind it and reads as a freeze. Build the block here and spread it into the body.
//
//   - sort: 'latency'          — try the fastest-responding provider first.
//   - require_parameters: true — only providers that honor every parameter we send (reasoning,
//                                temperature, …); one that would silently drop a parameter is skipped.
//   - preferred_min_throughput — keep out a fast-to-first-token but slow-to-generate provider; the
//                                floor the streaming paths always had and the batch calls were missing.
//   - only / ignore            — pin to a model's preferred providers, minus the blacklisted ones.

import { BLACKLISTED_PROVIDERS } from '../src/preferences/generationModel'

// Tokens/sec floor below which a provider is passed over. Same value everywhere.
const MIN_THROUGHPUT = 30

export function openRouterProvider(preferredProviders: string[] = []): Record<string, unknown> {
  const provider: Record<string, unknown> = {
    sort: 'latency',
    require_parameters: true,
    preferred_min_throughput: MIN_THROUGHPUT,
  }
  if (preferredProviders.length > 0) provider.only = preferredProviders
  if (BLACKLISTED_PROVIDERS.length > 0) provider.ignore = BLACKLISTED_PROVIDERS
  return provider
}
