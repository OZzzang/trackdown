// Thrown when a fingerprinting provider fails: unreachable, timed out, non-2xx, or a body
// we cannot parse. The route maps this to a 502 and its own generic message.
//
// `detail` is for our logs only. It may quote the provider's own wording, which must never
// reach the client — CLAUDE.md forbids forwarding a raw upstream body, and provider errors
// are exactly the kind of thing that leaks a token or an internal hostname.

export class UpstreamError extends Error {
  constructor(detail) {
    super('Fingerprinting provider failed');
    this.name = 'UpstreamError';
    this.detail = detail;
  }
}
