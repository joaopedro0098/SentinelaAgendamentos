import { useParams } from "react-router-dom";
import PublicBooking from "@agenda/pages/PublicBooking";

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  return <PublicBooking backHref={slug ? `/agendar/${slug}` : undefined} />;
}
