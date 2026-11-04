export const GENDERS = ["male", "female", "other", "unspecified"] as const;
export type Gender = (typeof GENDERS)[number];
