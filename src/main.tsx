import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./components/ThemeProvider";
import { AppPreferencesProvider } from "./components/AppPreferencesProvider";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
// import { BackendStatusProvider } from "./components/BackendStatusProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AppPreferencesProvider>
            {/* <BackendStatusProvider> */}
            <App />
            {/* </BackendStatusProvider> */}
          </AppPreferencesProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
