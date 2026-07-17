import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import App from "./App.js";
import { ThemeProvider } from "./theme.js";
import "streamdown/styles.css";
import "./index.css";
import "./styles/base.css";
import "./styles/theme-compat.css";
import "./styles/settings.css";
import "./styles/chat-workspace.css";
import "./styles/conversation-markdown.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 10 * 60_000,
      refetchOnReconnect: "always",
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
