#!/usr/bin/env bun
import { loadConfig, validateConfig, getConfig } from "./config";
import {
  createProfile,
  getProfile,
  updateProfile,
  listProfiles,
  deleteProfile,
} from "./services/profile";
import {
  getRecommendations,
  getRecommendationsForProfile,
  checkISBNAvailability,
} from "./services/orchestrator";
import { validateISBN } from "./services/recommendation";
import { getCacheStats, clearCache, pruneExpired } from "./services/cache";
import type { UserProfile, BookFormat } from "./types";

// Initialize adapters
import "./services/availability";

const HELP_TEXT = `
Book Recommendation Service CLI

Usage: bun run cli <command> [options]

Commands:
  recommend <profile-id>     Get book recommendations for a profile
  check <isbn>               Check availability for a specific ISBN

  profile create             Create a new user profile
  profile get <id>           Get a profile by ID
  profile list               List all profiles
  profile update <id>        Update a profile
  profile delete <id>        Delete a profile

  cache stats                Show cache statistics
  cache clear                Clear all cached data
  cache prune                Remove expired cache entries

  config show                Show current configuration
  config validate            Validate configuration

  help                       Show this help message

Options:
  --interests <list>         Comma-separated interests (for recommend/create)
  --price <number>           Maximum price ceiling
  --formats <list>           Comma-separated formats (ebook,paperback,hardcover)
  --skip-cache               Skip cache for availability checks
  --json                     Output in JSON format

Examples:
  bun run cli recommend my-profile --price 15
  bun run cli check 9780141439518 --json
  bun run cli profile create --interests "stoicism,philosophy" --price 20
`;

interface CLIOptions {
  interests?: string[];
  price?: number;
  formats?: BookFormat[];
  skipCache?: boolean;
  json?: boolean;
}

function parseArgs(args: string[]): { command: string[]; options: CLIOptions } {
  const command: string[] = [];
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);

      switch (key) {
        case "interests":
          options.interests = args[++i]?.split(",").map((s) => s.trim());
          break;
        case "price":
          options.price = parseFloat(args[++i]);
          break;
        case "formats":
          options.formats = args[++i]?.split(",").map((s) => s.trim()) as BookFormat[];
          break;
        case "skip-cache":
          options.skipCache = true;
          break;
        case "json":
          options.json = true;
          break;
        default:
          console.warn(`Unknown option: --${key}`);
      }
    } else {
      command.push(arg);
    }
  }

  return { command, options };
}

function output(data: unknown, json: boolean = false): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === "object") {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

async function handleRecommend(
  profileId: string | undefined,
  options: CLIOptions
): Promise<void> {
  if (!profileId) {
    // If no profile ID, create a temporary profile from options
    if (!options.interests || options.interests.length === 0) {
      console.error(
        "Error: Either provide a profile ID or --interests for recommendations"
      );
      process.exit(1);
    }

    const tempProfile: UserProfile = {
      id: "temp",
      interests: options.interests,
      previously_read: [],
      disliked_authors: [],
      price_ceiling: options.price ?? getConfig().price_ceiling_default,
      formats_accepted: options.formats ?? getConfig().formats_default,
      currency: "USD",
    };

    console.log("Generating recommendations for temporary profile...\n");
    const result = await getRecommendationsForProfile(tempProfile, {
      skipCache: options.skipCache,
    });

    outputRecommendations(result, options.json);
    return;
  }

  console.log(`Generating recommendations for profile: ${profileId}\n`);
  const result = await getRecommendations(profileId, {
    overrideInterests: options.interests,
    overridePriceCeiling: options.price,
    overrideFormats: options.formats,
    skipCache: options.skipCache,
  });

  outputRecommendations(result, options.json);
}

function outputRecommendations(
  result: Awaited<ReturnType<typeof getRecommendations>>,
  json?: boolean
): void {
  if (json) {
    output(result, true);
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("BOOK RECOMMENDATIONS");
  console.log("=".repeat(60));
  console.log(
    `Found ${result.recommendations.length} books (${result.filtered_count} filtered, ${result.total_candidates} total candidates)\n`
  );

  for (let i = 0; i < result.recommendations.length; i++) {
    const rec = result.recommendations[i];
    const book = rec.candidate;
    const option = rec.best_option;

    console.log(`${i + 1}. ${book.title}`);
    console.log(`   Author: ${book.author}`);
    console.log(`   ISBN: ${book.isbn_13}`);
    console.log(`   Year: ${book.publication_year}`);
    console.log(`   Why: ${book.reasoning}`);

    if (option) {
      const price = option.price === null ? "Free" : `$${option.price.toFixed(2)}`;
      console.log(
        `   Best Option: ${option.source} - ${option.format} - ${price}`
      );
      console.log(`   Link: ${option.url}`);
    }

    console.log("");
  }
}

async function handleCheck(isbn: string | undefined, options: CLIOptions): Promise<void> {
  if (!isbn) {
    console.error("Error: ISBN is required");
    process.exit(1);
  }

  // Validate ISBN format
  const validation = validateISBN(isbn);
  if (!validation.valid) {
    console.error(`Error: Invalid ISBN - ${validation.error}`);
    process.exit(1);
  }

  const normalizedISBN = validation.isbn_13!;
  console.log(`Checking availability for ISBN: ${normalizedISBN}\n`);

  const availability = await checkISBNAvailability(normalizedISBN, {
    formats: options.formats,
    skipCache: options.skipCache,
  });

  if (options.json) {
    output({ isbn: normalizedISBN, availability }, true);
    return;
  }

  if (availability.length === 0) {
    console.log("No availability found for this ISBN.");
    return;
  }

  console.log("Availability:");
  for (const record of availability) {
    const price = record.price === null ? "Free" : `$${record.price.toFixed(2)}`;
    const stock = record.in_stock ? "In Stock" : "Out of Stock";
    console.log(
      `  - ${record.source}: ${record.format} - ${price} (${stock})`
    );
    console.log(`    ${record.url}`);
  }
}

async function handleProfileCreate(options: CLIOptions): Promise<void> {
  const profile = await createProfile({
    interests: options.interests || [],
    previously_read: [],
    disliked_authors: [],
    price_ceiling: options.price ?? getConfig().price_ceiling_default,
    formats_accepted: options.formats ?? getConfig().formats_default,
    currency: "USD",
  });

  console.log(`Profile created with ID: ${profile.id}`);
  output(profile, options.json);
}

async function handleProfileGet(id: string | undefined, options: CLIOptions): Promise<void> {
  if (!id) {
    console.error("Error: Profile ID is required");
    process.exit(1);
  }

  const profile = await getProfile(id);
  if (!profile) {
    console.error(`Error: Profile not found: ${id}`);
    process.exit(1);
  }

  output(profile, options.json);
}

async function handleProfileList(options: CLIOptions): Promise<void> {
  const profiles = await listProfiles();

  if (options.json) {
    output(profiles, true);
    return;
  }

  if (profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  console.log(`Found ${profiles.length} profile(s):\n`);
  for (const profile of profiles) {
    console.log(`  ${profile.id}`);
    console.log(`    Interests: ${profile.interests.join(", ") || "(none)"}`);
    console.log(`    Price ceiling: $${profile.price_ceiling}`);
    console.log(`    Formats: ${profile.formats_accepted.join(", ")}`);
    console.log("");
  }
}

async function handleProfileUpdate(
  id: string | undefined,
  options: CLIOptions
): Promise<void> {
  if (!id) {
    console.error("Error: Profile ID is required");
    process.exit(1);
  }

  const updates: Partial<UserProfile> = {};
  if (options.interests) updates.interests = options.interests;
  if (options.price !== undefined) updates.price_ceiling = options.price;
  if (options.formats) updates.formats_accepted = options.formats;

  if (Object.keys(updates).length === 0) {
    console.error("Error: No updates provided. Use --interests, --price, or --formats");
    process.exit(1);
  }

  const profile = await updateProfile(id, updates);
  if (!profile) {
    console.error(`Error: Profile not found: ${id}`);
    process.exit(1);
  }

  console.log("Profile updated:");
  output(profile, options.json);
}

async function handleProfileDelete(id: string | undefined): Promise<void> {
  if (!id) {
    console.error("Error: Profile ID is required");
    process.exit(1);
  }

  const success = await deleteProfile(id);
  if (!success) {
    console.error(`Error: Profile not found or could not be deleted: ${id}`);
    process.exit(1);
  }

  console.log(`Profile deleted: ${id}`);
}

function handleCacheStats(options: CLIOptions): void {
  const stats = getCacheStats();
  output(stats, options.json);
}

function handleCacheClear(options: CLIOptions): void {
  const count = clearCache();
  output({ cleared: count }, options.json);
  if (!options.json) {
    console.log(`Cleared ${count} cache entries.`);
  }
}

function handleCachePrune(options: CLIOptions): void {
  const count = pruneExpired();
  output({ pruned: count }, options.json);
  if (!options.json) {
    console.log(`Pruned ${count} expired cache entries.`);
  }
}

function handleConfigShow(options: CLIOptions): void {
  const config = loadConfig();
  // Remove sensitive data
  const safeConfig = {
    ...config,
    openai_api_key: config.openai_api_key ? "***" : undefined,
    anthropic_api_key: config.anthropic_api_key ? "***" : undefined,
  };
  output(safeConfig, options.json);
}

function handleConfigValidate(options: CLIOptions): void {
  const config = loadConfig();
  const errors = validateConfig(config);

  if (errors.length === 0) {
    output({ valid: true, errors: [] }, options.json);
    if (!options.json) {
      console.log("Configuration is valid.");
    }
  } else {
    output({ valid: false, errors }, options.json);
    if (!options.json) {
      console.error("Configuration errors:");
      for (const error of errors) {
        console.error(`  - ${error}`);
      }
    }
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    console.log(HELP_TEXT);
    return;
  }

  const { command, options } = parseArgs(args);

  try {
    switch (command[0]) {
      case "recommend":
        await handleRecommend(command[1], options);
        break;

      case "check":
        await handleCheck(command[1], options);
        break;

      case "profile":
        switch (command[1]) {
          case "create":
            await handleProfileCreate(options);
            break;
          case "get":
            await handleProfileGet(command[2], options);
            break;
          case "list":
            await handleProfileList(options);
            break;
          case "update":
            await handleProfileUpdate(command[2], options);
            break;
          case "delete":
            await handleProfileDelete(command[2]);
            break;
          default:
            console.error(`Unknown profile command: ${command[1]}`);
            console.log("Use: profile create|get|list|update|delete");
            process.exit(1);
        }
        break;

      case "cache":
        switch (command[1]) {
          case "stats":
            handleCacheStats(options);
            break;
          case "clear":
            handleCacheClear(options);
            break;
          case "prune":
            handleCachePrune(options);
            break;
          default:
            console.error(`Unknown cache command: ${command[1]}`);
            console.log("Use: cache stats|clear|prune");
            process.exit(1);
        }
        break;

      case "config":
        switch (command[1]) {
          case "show":
            handleConfigShow(options);
            break;
          case "validate":
            handleConfigValidate(options);
            break;
          default:
            console.error(`Unknown config command: ${command[1]}`);
            console.log("Use: config show|validate");
            process.exit(1);
        }
        break;

      default:
        console.error(`Unknown command: ${command[0]}`);
        console.log("Use 'help' to see available commands.");
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
