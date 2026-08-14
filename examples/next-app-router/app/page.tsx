export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 640 }}>
      <h1>never-rest · Next App Router</h1>
      <p>
        <code>handler.ts</code> is the railway (<code>serve</code> with{" "}
        <code>{`basePath: '/api'`}</code>). The catch-all at <code>/api/*</code>{" "}
        only forwards each HTTP method to that handler.
      </p>
      <ul>
        <li>
          <code>GET /api/users</code>
        </li>
        <li>
          <code>GET /api/users/ada</code>
        </li>
        <li>
          <code>POST /api/users</code> with JSON <code>{`{"name":"…"}`}</code>
        </li>
      </ul>
    </main>
  );
}
