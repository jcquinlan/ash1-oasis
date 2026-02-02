import type { Config, BookFormat } from "./types";

const defaultConfig: Config = {
  price_ceiling_default: 20,
  formats_default: ["ebook", "paperback"] as BookFormat[],
  candidate_count: 20, // request more than needed since filtering will reduce
  max_results: 10,
  cache_ttl_hours: 48,
  enabled_sources: ["open_library", "thriftbooks"],
  llm_provider: "openai",
  llm_model: "gpt-4o-mini",
};

export function loadConfig(): Config {
  return {
    ...defaultConfig,
    price_ceiling_default: parseFloat(
      process.env.BOOK_PRICE_CEILING || String(defaultConfig.price_ceiling_default)
    ),
    formats_default: process.env.BOOK_FORMATS
      ? (process.env.BOOK_FORMATS.split(",") as BookFormat[])
      : defaultConfig.formats_default,
    candidate_count: parseInt(
      process.env.BOOK_CANDIDATE_COUNT || String(defaultConfig.candidate_count),
      10
    ),
    max_results: parseInt(
      process.env.BOOK_MAX_RESULTS || String(defaultConfig.max_results),
      10
    ),
    cache_ttl_hours: parseInt(
      process.env.BOOK_CACHE_TTL_HOURS || String(defaultConfig.cache_ttl_hours),
      10
    ),
    enabled_sources: process.env.BOOK_ENABLED_SOURCES
      ? process.env.BOOK_ENABLED_SOURCES.split(",")
      : defaultConfig.enabled_sources,
    llm_provider: (process.env.BOOK_LLM_PROVIDER as Config["llm_provider"]) ||
      defaultConfig.llm_provider,
    llm_model: process.env.BOOK_LLM_MODEL || defaultConfig.llm_model,
    openai_api_key: process.env.OPENAI_API_KEY,
    anthropic_api_key: process.env.ANTHROPIC_API_KEY,
  };
}

export function validateConfig(config: Config): string[] {
  const errors: string[] = [];

  if (config.llm_provider === "openai" && !config.openai_api_key) {
    errors.push("OPENAI_API_KEY environment variable is required when using OpenAI provider");
  }

  if (config.llm_provider === "anthropic" && !config.anthropic_api_key) {
    errors.push("ANTHROPIC_API_KEY environment variable is required when using Anthropic provider");
  }

  if (config.candidate_count < 1) {
    errors.push("candidate_count must be at least 1");
  }

  if (config.max_results < 1) {
    errors.push("max_results must be at least 1");
  }

  if (config.cache_ttl_hours < 1) {
    errors.push("cache_ttl_hours must be at least 1");
  }

  if (config.enabled_sources.length === 0) {
    errors.push("At least one source must be enabled");
  }

  return errors;
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}
