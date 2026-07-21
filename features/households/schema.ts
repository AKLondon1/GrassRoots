import { z } from "zod";

const isoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}, "Enter a valid date in YYYY-MM-DD format.");

export const guardianPermissionFlagsSchema = z.object({
  communication: z.boolean(),
  payments: z.boolean(),
  consent: z.boolean(),
  emergencyContact: z.boolean(),
  restrictedContact: z.boolean(),
});

export const playerSchema = z.object({
  id: z.string().min(1),
  organisationId: z.string().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  dateOfBirth: isoDate,
});

export const guardianSchema = z.object({
  id: z.string().min(1),
  organisationId: z.string().min(1),
  membershipId: z.string().min(1).nullable(),
  displayName: z.string().trim().min(2),
  email: z.email().optional(),
  status: z.enum(["pending", "active", "inactive"]),
});

export const householdSchema = z.object({
  id: z.string().min(1),
  organisationId: z.string().min(1),
  name: z.string().trim().min(2),
});

export const playerGuardianSchema = z.object({
  id: z.string().min(1),
  organisationId: z.string().min(1),
  householdId: z.string().min(1),
  playerId: z.string().min(1),
  guardianId: z.string().min(1),
  relationship: z.string().trim().min(2),
  permissions: guardianPermissionFlagsSchema,
});
