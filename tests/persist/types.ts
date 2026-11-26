// Compile-time checks, run by `pnpm typecheck`: each `@ts-expect-error` fails the typecheck if the
// line below it compiles.
import { expectTypeOf } from "vitest"
import { z } from "zod"

import { useMachine as useReact } from "../../src/adapters/react.ts"
import { createMachine as createSolid } from "../../src/adapters/solid.ts"
import { createMachine as createSvelte } from "../../src/adapters/svelte.ts"
import { useMachine as useVue } from "../../src/adapters/vue.ts"
import { actor, type Slot, type Tagged } from "../../src/index.ts"
import { createPersister } from "../../src/persist.ts"
import { CartEffect, CartZod, shop, type Cart } from "../shop.ts"

const persist = createPersister(undefined)
const cart = shop(() => {})
type Resumable = Exclude<Cart, { _tag: "paid" }>

// The slot loads what the schema decodes, and saves any tagged state, `paid` included.
expectTypeOf(persist("cart", CartEffect).load).returns.toEqualTypeOf<Resumable | undefined>()
expectTypeOf(persist("cart", CartZod).save).parameter(0).toEqualTypeOf<Tagged>()

// Schemas that leave out `paid` fit the machine without a cast.
actor(cart, persist("cart", CartZod))
actor(cart, persist("cart", CartEffect))
useReact(cart, persist("cart", CartZod))
useVue(cart, persist("cart", CartZod))
createSolid(cart, persist("cart", CartEffect))
createSvelte(cart, persist("cart", CartEffect))

// `from` still takes a state, and the adapters still infer `State` from the machine.
expectTypeOf(useReact(cart, { _tag: "paid" })[0]).toEqualTypeOf<Cart>()

// @ts-expect-error the schema decodes a state the machine doesn't have
actor(cart, persist("cart", z.object({ _tag: z.literal("lost") })))

const partial: Slot<Resumable> = { load: () => undefined, save: () => {} }
// @ts-expect-error a hand-built slot whose `save` only takes some states would miss `paid`
actor(cart, partial)

// @ts-expect-error the schema must decode a tagged state
persist("cart", z.number())
