import { useLocation, useNavigate, useParams } from "react-router-dom";
import PublicBooking, { type RescheduleContext } from "@agenda/pages/PublicBooking";

type LocationState = {
  reschedule?: RescheduleContext;
  whatsapp?: string;
};

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? null;
  const reschedule = state?.reschedule ?? null;

  return (
    <PublicBooking
      backHref={reschedule ? `/agendar/${slug}/meus-agendamentos` : slug ? `/agendar/${slug}` : undefined}
      reschedule={reschedule}
      onRescheduleComplete={() =>
        navigate(`/agendar/${slug}/meus-agendamentos`, { replace: true, state: { whatsapp: state?.whatsapp } })
      }
    />
  );
}
