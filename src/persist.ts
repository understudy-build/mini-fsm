import type { Slot, Tagged } from "./index.ts"
import type { StandardSchemaV1 } from "./standard-schema.ts"

export type { StandardSchemaV1 }

/** The part of the Web Storage API a persister uses. `localStorage` and `sessionStorage` fit. */
export type Storage = {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
}

/** Why saved data was thrown away. The actor then starts from `machine.initial`. */
export type Discard =
  | { readonly _tag: "json" }
  | { readonly _tag: "version"; readonly found: unknown }
  | { readonly _tag: "invalid"; readonly issues: ReadonlyArray<StandardSchemaV1.Issue> }

/**
 * Loads what the schema accepts and saves any state, so a schema that leaves out a final state
 * still fits its machine: the next visit starts fresh.
 */
export type Persist = <S extends Tagged>(
  key: string,
  schema: StandardSchemaV1<unknown, S>,
) => Slot<S, Tagged>

/**
 * Stores `{ version, state }` as JSON under each key, and decodes `state` with the key's schema on
 * load. Without `storage`, as on the server, slots load nothing and save nothing.
 */
export const createPersister =
  (
    storage: Storage | undefined,
    {
      version = 0,
      discard = () => {},
    }: {
      /** Saved data with another version is discarded. Defaults to `0`. */
      readonly version?: number
      readonly discard?: (key: string, reason: Discard) => void
    } = {},
  ): Persist =>
  (key, schema) => ({
    load: () => {
      const text = storage?.getItem(key)
      if (text == null) return
      // Any JSON: reading a property of a number or a string gives undefined too.
      let saved: { readonly version?: unknown; readonly state?: unknown } | null
      try {
        saved = JSON.parse(text)
      } catch {
        discard(key, { _tag: "json" })
        return
      }
      const found = saved?.version
      if (found !== version) {
        discard(key, { _tag: "version", found })
        return
      }
      const result = schema["~standard"].validate(saved?.state)
      if ("then" in result) throw new Error(`"${key}": only synchronous schemas are supported`)
      if (!result.issues) return result.value
      discard(key, { _tag: "invalid", issues: result.issues })
    },
    save: (state) => storage?.setItem(key, JSON.stringify({ version, state })),
  })
