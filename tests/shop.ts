import { Schema } from "effect"
import { z } from "zod"

import { machine } from "../src/index.ts"

export type Cart =
  | { readonly _tag: "cart"; readonly items: number }
  | { readonly _tag: "paying"; readonly items: number }
  | { readonly _tag: "paid" }
export type CartEvent =
  | { readonly _tag: "add" }
  | { readonly _tag: "pay" }
  | { readonly _tag: "confirm" }

// A factory machine: its handlers queue calls to the dependencies it closes over.
export const shop = (log: (line: string) => void) =>
  machine<Cart, CartEvent>()({
    initial: { _tag: "cart", items: 0 },
    states: {
      cart: {
        to: ["paying"],
        on: {
          add: (state, _, after) => {
            after(() => log("toast: Added"))
            return { ...state, items: state.items + 1 }
          },
          pay: (state, _, after) => {
            if (state.items === 0) {
              after(() => log("toast: Your cart is empty"))
              return state
            }
            after(() => log("toast: Paying"))
            after(() => log("track: pay"))
            return { _tag: "paying", items: state.items }
          },
        },
      },
      paying: {
        to: ["paid"],
        on: { confirm: () => ({ _tag: "paid" }) },
        enter: () => log("charge"),
      },
      paid: { to: [] },
    },
  })

// What a reload may resume: `paid` is left out, so a finished order starts a new cart.
export const CartZod = z.discriminatedUnion("_tag", [
  z.object({ _tag: z.literal("cart"), items: z.number() }),
  z.object({ _tag: z.literal("paying"), items: z.number() }),
])

export const CartEffect = Schema.toStandardSchemaV1(
  Schema.Union([
    Schema.TaggedStruct("cart", { items: Schema.Number }),
    Schema.TaggedStruct("paying", { items: Schema.Number }),
  ]),
)
