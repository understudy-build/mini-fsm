<script lang="ts">
  import { createMachine } from '../../src/adapters/svelte.ts'
  import type { Persist } from '../../src/persist.ts'
  import { CartZod, shop } from '../shop.ts'

  const { persist }: { persist: Persist } = $props()
  const cart = createMachine(shop(() => {}), persist('cart', CartZod))
  const items = $derived(cart.state._tag === 'paid' ? 0 : cart.state.items)
</script>

<p>{cart.state._tag}: {items} items</p>
<button type="button" disabled={!cart.can({ _tag: 'pay' })}>Pay</button>
<!-- Svelte keeps the server's `href` while hydrating. -->
<a href={`/cart?items=${items}`}>Share</a>
