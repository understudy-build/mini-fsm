import { vi } from "vitest"

type Request = {
  readonly url: string
  readonly signal: AbortSignal
  readonly respond: (json: unknown) => void
}

/** Replaces global `fetch`. Requests reject on abort like the real one, unless `honorAbort` is false. */
export const fakeFetch = ({ honorAbort = true }: { honorAbort?: boolean } = {}) => {
  const requests: Array<Request> = []
  vi.stubGlobal(
    "fetch",
    (url: string, init: { signal: AbortSignal }) =>
      new Promise((resolve, reject) => {
        if (honorAbort) {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          )
        }
        requests.push({
          url,
          signal: init.signal,
          respond: (json) => resolve(new Response(JSON.stringify(json))),
        })
      }),
  )
  return requests
}
