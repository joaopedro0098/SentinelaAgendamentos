import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  registerUserFacialEmbedding,
} from "@/features/auth/face-verification/facialRecognitionController";
import { FACIAL_TRIAL_BLOCKED_MESSAGE } from "@/lib/subscriptionMessages";
import {
  clearPendingFaceEmbedding,
  loadPendingFaceEmbedding,
} from "@/features/auth/face-verification/pendingFaceStorage";
import { markFaceVerificationComplete, userNeedsFaceVerification } from "@/features/auth/face-verification/facialVerificationStatus";
import { authInfoToast } from "@/features/auth/lib/authToast";
import { clearSubscriptionCache } from "@/providers/SubscriptionProvider";

type Options = {
  email: string;
  shopName?: string;
};

/** Após OTP confirmado: metadados, rosto pendente e checagem de acesso ao app. */
export async function completeSignupSession(session: Session, options: Options) {
  if (options.shopName) {
    await supabase.auth.updateUser({ data: { shop_name: options.shopName } });
  }

  const pending = loadPendingFaceEmbedding(options.email);
  if (pending) {
    const registered = await registerUserFacialEmbedding(pending.embedding);
    clearPendingFaceEmbedding();
    clearSubscriptionCache();
    markFaceVerificationComplete(session.user.id);
    if (!registered.trialEligible || registered.facialMatch) {
      authInfoToast(FACIAL_TRIAL_BLOCKED_MESSAGE);
    }
  }

  const needsFace = await userNeedsFaceVerification(session.user.id);
  return { needsFace };
}
