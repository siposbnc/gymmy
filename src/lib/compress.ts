/**
 * Raw deflate, over bytes.
 *
 * Exists for share codes: the difference between pasting ~800 characters and
 * ~250 is the difference between a code that looks like a glitch in a chat
 * thread and one that looks like a code. `deflate-raw` rather than `deflate`
 * or `gzip` because the wrapper bytes buy nothing — the marker already says
 * what the payload is, and nothing else will ever read it.
 *
 * `CompressionStream` is a web platform global (Safari 16.4+, so every iOS
 * that can install the PWA), which is why this sits in `lib/` rather than
 * `domain/`: a Capacitor build is the kind of place that would want to swap it.
 *
 * The reader/writer loop is deliberate. The obvious spelling —
 * `new Response(blob.stream().pipeThrough(cs)).arrayBuffer()` — depends on
 * `Blob.stream`, which jsdom does not implement, so it would leave every path
 * through here untestable.
 */

async function pump(
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = transform.writable.getWriter()
  // Not awaited: for a payload this small the whole input fits in the
  // transform's queue, and awaiting the write before reading would deadlock if
  // it ever did not.
  void writer
    .write(bytes)
    .then(() => writer.close())
    .catch(() => {
      // The read loop below surfaces the same failure with context.
    })

  const reader = transform.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }

  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

export async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return pump(bytes, new CompressionStream('deflate-raw'))
}

/** Rejects on anything that is not a valid deflate stream. */
export async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return pump(bytes, new DecompressionStream('deflate-raw'))
}
