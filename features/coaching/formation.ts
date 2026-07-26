const validPositions = new Set(["GK", "LB", "CB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LW", "RW", "ST"]);

export interface FormationSlot { playerId: string; position: string }

export function validateFormation(input: { format: number; slots: readonly FormationSlot[] }) {
  const errors: string[] = [];
  if (input.slots.length !== input.format) errors.push(`A ${input.format}-a-side formation needs ${input.format} players.`);
  if (new Set(input.slots.map(({ playerId }) => playerId)).size !== input.slots.length) errors.push("Each player can occupy only one position.");
  if (input.slots.filter(({ position }) => position === "GK").length !== 1) errors.push("The formation must include exactly one goalkeeper.");
  if (input.slots.some(({ position }) => !validPositions.has(position))) errors.push("The formation contains an unsupported position.");
  if (input.slots.some(({ playerId }) => !playerId.trim())) errors.push("Every formation slot needs a player.");
  return { valid: errors.length === 0, errors };
}
