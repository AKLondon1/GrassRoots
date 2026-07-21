import { z } from "zod";

export const peopleImportHeaders = [
  "player_first_name",
  "player_last_name",
  "date_of_birth",
  "team",
  "guardian_name",
  "guardian_email",
  "relationship",
  "communication",
  "payments",
  "consent",
] as const;

const importBoolean = z
  .union([
    z.boolean(),
    z.string().trim().toLowerCase().pipe(z.enum(["true", "false"])),
  ])
  .transform((value) => value === true || value === "true");

const importDate = z.string().trim().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().startsWith(value) &&
    value <= new Date().toISOString().slice(0, 10)
  );
}, "Use a past or present date in YYYY-MM-DD format.");

export const peopleImportRowSchema = z.object({
  player_first_name: z.string().trim().min(1, "Enter the player's first name."),
  player_last_name: z.string().trim().min(1, "Enter the player's last name."),
  date_of_birth: importDate,
  team: z.string().trim().min(1, "Enter a team."),
  guardian_name: z.string().trim().min(2, "Enter the guardian's name."),
  guardian_email: z.email("Enter a valid guardian email address."),
  relationship: z.string().trim().min(2, "Enter the relationship."),
  communication: importBoolean,
  payments: importBoolean,
  consent: importBoolean,
});

export type PeopleImportRow = z.infer<typeof peopleImportRowSchema>;
