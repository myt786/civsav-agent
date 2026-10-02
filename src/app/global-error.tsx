"use client";

import { useEffect } from "react";

// Last-resort screen when even the root layout fails. It replaces the whole
// document, so it can't rely on the app's fonts or styles — kept plain.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0f17",
          color: "#e6e9ef",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div style={{ maxWidth: 440, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>The dashboard couldn&apos;t load</h1>
          <p style={{ fontSize: 14, opacity: 0.7, margin: "0 0 16px" }}>
            Something went wrong on the server, usually a brief database hiccup. Try again in a moment.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, opacity: 0.5, fontFamily: "ui-monospace, monospace", margin: "0 0 16px" }}>
              Error code: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#5b8cff",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
