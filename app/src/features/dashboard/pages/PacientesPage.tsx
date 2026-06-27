import { useEffect } from "react";

export default function PacientesPage() {
  useEffect(() => {
    document.title = "Pacientes — Sentinela Agendamentos";
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full overflow-x-hidden">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
      </header>
    </div>
  );
}
