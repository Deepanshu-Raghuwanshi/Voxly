import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const TIMEOUT_MS = 5_000;

interface WeatherApiResponse {
  name: string;
  main: { temp: number; feels_like: number; humidity: number };
  weather: Array<{ description: string }>;
}

@Injectable()
export class OpenWeatherService {
  private readonly logger = new Logger(OpenWeatherService.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.get<string>("OPENWEATHER_API_KEY")!;
  }

  async getWeather(city: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=metric`;
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as WeatherApiResponse;

      return (
        `City: ${data.name} | ` +
        `Temp: ${Math.round(data.main.temp)}°C | ` +
        `Feels like: ${Math.round(data.main.feels_like)}°C | ` +
        `Condition: ${data.weather[0]?.description ?? "Unknown"} | ` +
        `Humidity: ${data.main.humidity}%`
      );
    } catch (err) {
      const reason =
        err instanceof Error
          ? err.name === "AbortError"
            ? "timeout"
            : err.message
          : String(err);
      this.logger.warn(`Weather lookup failed: ${reason}`);
      throw new Error(`Weather lookup failed: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
