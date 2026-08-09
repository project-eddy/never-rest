export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 640 }}>
      <h1>never-rest · Next App Router</h1>
      <p>
        API is mounted at <code>/api/*</code> via a catch-all route that calls{" "}
        <code>serve()</code> with the shared users contract.
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
