<script lang="ts">
  import { createMachine } from '../../src/adapters/svelte.ts'
  import { searchMachine } from '../search.ts'

  const search = createMachine(searchMachine)
</script>

<button type="button" onclick={() => search.send({ _tag: 'search', query: 'ts' })}>Search</button>
{#if search.state._tag === 'loading'}
  <p>Loading {search.state.query}</p>
{:else if search.state._tag === 'success'}
  <ul>
    {#each search.state.items as item (item)}
      <li>{item}</li>
    {/each}
  </ul>
{/if}
