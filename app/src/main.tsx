import { createRoot } from "react-dom/client";
import App from "@/app/App";
import "@/styles/index.css";
import { registerAppServiceWorker } from "@/lib/pwaInstall";

registerAppServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
