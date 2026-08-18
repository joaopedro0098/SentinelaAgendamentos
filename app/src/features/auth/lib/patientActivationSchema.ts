import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/features/auth/components/PasswordInput";

export const PASSWORDS_MISMATCH_MESSAGE = "Senhas não estão iguais.";

export const patientActivationSchema = z
  .object({
    email: z.string().trim().email("E-mail inválido").max(255),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .max(72),
    confirm_password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .max(72),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: PASSWORDS_MISMATCH_MESSAGE,
    path: ["confirm_password"],
  });
