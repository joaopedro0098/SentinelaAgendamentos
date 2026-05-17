import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import Home from "./pages/Home";
import PublicBooking from "./pages/PublicBooking";
import MeusAgendamentos from "./pages/MeusAgendamentos";
import NotFound from "./pages/NotFound.tsx";

const App = () => (
  <>
    <Toaster richColors position="top-center" />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/agendar" element={<Home />} />
        <Route path="/agendar/:slug" element={<PublicBooking />} />
        <Route path="/agendar/:slug/meus" element={<MeusAgendamentos />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </>
);

export default App;
