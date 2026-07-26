export interface BrandPalette {
  accent: string;
  background: string;
  border: string;
  borderOnDark: string;
  borderStrong: string;
  ink: string;
  inkOnDarkMuted: string;
  inkRaised: string;
  muted: string;
  primary: string;
  primaryForeground: string;
  primaryLight: string;
  primaryStrong: string;
  ring: string;
  surface: string;
  surfaceStrong: string;
}

const brandCssVariableNames = {
  accent: "--brand-accent",
  background: "--brand-background",
  border: "--brand-border",
  borderOnDark: "--brand-border-on-dark",
  borderStrong: "--brand-border-strong",
  ink: "--brand-ink",
  inkOnDarkMuted: "--brand-ink-on-dark-muted",
  inkRaised: "--brand-ink-raised",
  muted: "--brand-muted",
  primary: "--brand-primary",
  primaryForeground: "--brand-primary-foreground",
  primaryLight: "--brand-primary-light",
  primaryStrong: "--brand-primary-strong",
  ring: "--brand-ring",
  surface: "--brand-surface",
  surfaceStrong: "--brand-surface-strong",
} as const satisfies Record<keyof BrandPalette, `--brand-${string}`>;

export type BrandCssVariables = Record<
  (typeof brandCssVariableNames)[keyof BrandPalette],
  string
>;

export function createBrandCssVariables(
  palette: BrandPalette,
): BrandCssVariables {
  return Object.entries(brandCssVariableNames).reduce(
    (variables, [token, variableName]) => {
      variables[variableName as keyof BrandCssVariables] =
        palette[token as keyof BrandPalette];
      return variables;
    },
    {} as BrandCssVariables,
  );
}

export const brand = {
  name: "GrassRoots",
  legalName: "GrassRoots",
  tagline: "Football organised around people.",
  description:
    "One calm place for grassroots football schedules, availability, teams, pitches and club operations.",
  identity: {
    mark: "GR",
    markLabel: "GrassRoots monogram",
    colourStrategy: "restrained",
    controlRadius: "10px",
    palette: {
      background: "oklch(1 0 0)",
      surface: "oklch(0.975 0.004 188)",
      surfaceStrong: "oklch(0.94 0.008 188)",
      ink: "oklch(0.2 0.025 210)",
      inkRaised: "oklch(0.25 0.027 210)",
      inkOnDarkMuted: "oklch(0.86 0.012 188)",
      muted: "oklch(0.43 0.025 210)",
      primary: "oklch(0.56 0.12 188)",
      primaryStrong: "oklch(0.45 0.13 188)",
      primaryLight: "oklch(0.78 0.1 188)",
      primaryForeground: "oklch(0.99 0.003 188)",
      accent: "oklch(0.72 0.14 72)",
      border: "oklch(0.89 0.012 188)",
      borderStrong: "oklch(0.79 0.025 188)",
      borderOnDark: "oklch(0.36 0.025 210)",
      ring: "oklch(0.52 0.13 188)",
    } satisfies BrandPalette,
  },
  locale: "en-GB",
  timeZone: "Europe/London",
  currency: "GBP",
} as const;
