import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const UploadMetaSchema = z.object({
  kind: z.string().min(1),
  studentRef: z.string().min(1),
  studentId: z.string().min(1).optional(),
  studentEmail: z.string().email().optional(),
  studentName: z.string().min(1).optional()
});

export const VerifySchema = z.object({
  docId: z.string().min(1)
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type UploadMeta = z.infer<typeof UploadMetaSchema>;
export type VerifyInput = z.infer<typeof VerifySchema>;
