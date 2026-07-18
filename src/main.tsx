import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@fontsource/alfa-slab-one";
import "@fontsource/fraunces/400-italic.css";
import "@fontsource/fraunces/600-italic.css";
import "./index.css";
import App from "./App";
import { StoreProvider } from "./store/store";
import V1TournamentApp from "./product/V1TournamentApp";

// A tournament (#/e/<eventId>) is its own top-level surface with its own
// router — a Router can't nest inside another Router, and the v1 pages the
// tournament renders navigate with absolute paths. Everything else lives
// under the HashRouter as before.

function subscribeToHash(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener("popstate", cb);
  };
}

function Root() {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash);
  const tournament = /^#\/e\/([^/?]+)/.exec(hash);
  if (tournament) {
    return <V1TournamentApp key={tournament[1]} eventId={tournament[1]} />;
  }
  return (
    <HashRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </HashRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
