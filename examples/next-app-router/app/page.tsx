export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 640 }}>
      <h1>never-rest · Next App Router</h1>
      <p>
        API is mounted at <code>/api/*</code> via a catch-all route that imports
        the shared users contract, runs local handlers through{" "}
        <code>serve()</code>, and strips the <code>/api</code> prefix.
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
