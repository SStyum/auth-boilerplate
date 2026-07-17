import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('e-mail inválido'),
  password: z.string().min(8, 'mínimo 8 caracteres'),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email('e-mail inválido'),
  password: z.string().min(8, 'mínimo 8 caracteres').max(72, 'máximo 72 caracteres'),
  name: z.string().max(80, 'máximo 80 caracteres').optional().or(z.literal('')),
});
export type RegisterFormValues = z.infer<typeof registerSchema>;
