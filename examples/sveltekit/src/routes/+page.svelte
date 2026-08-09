<script lang="ts">
  // Landing page — API is handled in hooks.server.ts for /users*
</script>

<main style="font-family: system-ui; padding: 24px; max-width: 640px">
  <h1>never-rest · SvelteKit</h1>
  <p>
    <code>hooks.server.ts</code> forwards <code>/users*</code> to
    <code>serve()</code> with the shared users contract (paths match the contract
    exactly).
  </p>
  <ul>
    <li><code>GET /users</code></li>
    <li><code>GET /users/ada</code></li>
    <li><code>POST /users</code> with JSON <code>{`{"name":"…"}`}</code></li>
  </ul>
</main>
