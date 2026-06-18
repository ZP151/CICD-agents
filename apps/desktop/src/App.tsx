import { useLocation } from "react-router-dom";
import { AppDataProvider, useAppData } from "./app/AppDataContext.js";
import { FullLayout, MiniLayout } from "./app/AppShell.js";
import { AuthProvider } from "./app/authContext.js";
import { DaemonGate } from "./app/daemonGate.js";
import { ProductionAuthGate } from "./app/ProductionAuthGate.js";
import { useWindowState } from "./app/windowState.js";

export { useAppData };

export default function App(): JSX.Element {
  const location = useLocation();
  useWindowState();

  if (location.pathname === "/chat-mini") return <MiniLayout />;

  return (
    <DaemonGate>
      {(info) => (
        <AuthProvider>
          <ProductionAuthGate info={info}>
            <AppDataProvider daemonReady={info.state === "ready"}>
              <FullLayout />
            </AppDataProvider>
          </ProductionAuthGate>
        </AuthProvider>
      )}
    </DaemonGate>
  );
}
