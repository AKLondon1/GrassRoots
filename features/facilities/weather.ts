export interface WeatherSummary {
  readonly source: "development-fixture";
  readonly productionReady: false;
  readonly condition: string;
  readonly rainfallMm: number;
}

export function getDevelopmentWeather(): WeatherSummary {
  return { source: "development-fixture", productionReady: false, condition: "Recent rain", rainfallMm: 8 };
}

