<script lang="ts">
  // Landing page — API traffic is decided in hooks.server.ts via handle(),
  // not a /users* prefix and not a +server.ts file.
</script>

<main style="font-family: system-ui; padding: 24px; max-width: 640px">
  <h1>never-rest · SvelteKit</h1>
  <p>
    <code>src/handler.ts</code> is the railway (<code>serve</code>).
    <code>hooks.server.ts</code> is the mount: contract paths return the
    never-rest response; everything else falls through to this page.
  </p>
  <ul>
    <li><code>GET /users</code></li>
    <li><code>GET /users/ada</code></li>
    <li><code>POST /users</code> with JSON <code>{`{"name":"…"}`}</code></li>
  </ul>
</main>
