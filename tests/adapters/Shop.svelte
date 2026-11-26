<script lang="ts">
  import { createMachine } from '../../src/adapters/svelte.ts'
  import { shop } from '../shop.ts'

  const cart = createMachine(shop(() => {}))
</script>

<button type="button" onclick={() => cart.send({ _tag: 'add' })}>Add</button>
<button type="button" disabled={!cart.can({ _tag: 'pay' })} onclick={() => cart.send({ _tag: 'pay' })}>
  Pay
</button>
