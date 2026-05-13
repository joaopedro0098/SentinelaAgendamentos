import { Link } from "react-router-dom";

const LandingFooter = () => (
  <footer className="border-t border-border/40 bg-background/40 backdrop-blur-sm">
    <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
      <p className="text-center sm:text-left">
        © {new Date().getFullYear()} Sentinela Agendamentos
      </p>
      <Link
        to="/politica-de-privacidade"
        className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
      >
        Política de privacidade
      </Link>
    </div>
  </footer>
);

export default LandingFooter;
