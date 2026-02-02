import type {
  UserProfile,
  BookCandidate,
  BookResult,
  AvailabilityRecord,
  BookFormat,
  RecommendationResponse,
} from "../types";
import { getConfig } from "../config";
import { getProfile } from "./profile";
import {
  generateRecommendations,
  filterPreviouslyRead,
  filterDislikedAuthors,
} from "./recommendation";
import { getCachedAvailability, setCachedAvailability } from "./cache";
import { getAllAdapters, getAdapter } from "./availability";

export interface OrchestrationOptions {
  overrideInterests?: string[];
  overridePriceCeiling?: number;
  overrideFormats?: BookFormat[];
  skipCache?: boolean;
}

/**
 * Check availability for a single book across all enabled sources
 */
async function checkBookAvailability(
  candidate: BookCandidate,
  profile: UserProfile,
  options: OrchestrationOptions
): Promise<BookResult> {
  const config = getConfig();
  const availability: AvailabilityRecord[] = [];
  const formats = options.overrideFormats ?? profile.formats_accepted;
  const priceCeiling = options.overridePriceCeiling ?? profile.price_ceiling;

  // Get enabled adapters
  const enabledAdapters = config.enabled_sources
    .map((name) => getAdapter(name))
    .filter((adapter) => adapter !== undefined);

  // Check each source
  for (const adapter of enabledAdapters) {
    // Skip if adapter doesn't support any of the user's formats
    const supportsFormat = formats.some((f) => adapter.supports_format(f));
    if (!supportsFormat) {
      continue;
    }

    // Check cache first
    if (!options.skipCache) {
      const cached = getCachedAvailability(candidate.isbn_13, adapter.name);
      if (cached !== undefined) {
        if (cached !== null) {
          availability.push(cached);
        }
        continue; // Skip API call, use cached result
      }
    }

    // Query the adapter
    try {
      console.log(
        `[Orchestrator] Checking ${adapter.name} for ISBN ${candidate.isbn_13}`
      );
      const record = await adapter.check(candidate.isbn_13);

      // Cache the result (even null results)
      setCachedAvailability(candidate.isbn_13, adapter.name, record);

      if (record) {
        availability.push(record);
      }
    } catch (error) {
      console.error(
        `[Orchestrator] Error checking ${adapter.name} for ISBN ${candidate.isbn_13}:`,
        error
      );
    }
  }

  // Find the best option (cheapest that meets criteria)
  const validOptions = availability.filter((record) => {
    // Must be in stock
    if (!record.in_stock) return false;

    // Must be an accepted format
    if (!formats.includes(record.format)) return false;

    // Must be within price ceiling (null price = free, always acceptable)
    if (record.price !== null && record.price > priceCeiling) return false;

    return true;
  });

  // Sort by price (free first, then ascending)
  validOptions.sort((a, b) => {
    const priceA = a.price ?? -1;
    const priceB = b.price ?? -1;
    return priceA - priceB;
  });

  const bestOption = validOptions.length > 0 ? validOptions[0] : null;

  return {
    candidate,
    availability,
    best_option: bestOption,
    meets_criteria: bestOption !== null,
  };
}

/**
 * Main orchestration function - generates recommendations and checks availability
 */
export async function getRecommendations(
  profileId: string,
  options: OrchestrationOptions = {}
): Promise<RecommendationResponse> {
  const config = getConfig();

  // Load user profile
  const profile = await getProfile(profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  // Apply overrides to profile for this request
  const effectiveProfile: UserProfile = {
    ...profile,
    interests: options.overrideInterests ?? profile.interests,
    price_ceiling: options.overridePriceCeiling ?? profile.price_ceiling,
    formats_accepted: options.overrideFormats ?? profile.formats_accepted,
  };

  console.log(
    `[Orchestrator] Generating recommendations for profile ${profileId}`
  );
  console.log(`[Orchestrator] Interests: ${effectiveProfile.interests.join(", ")}`);
  console.log(`[Orchestrator] Price ceiling: $${effectiveProfile.price_ceiling}`);
  console.log(`[Orchestrator] Formats: ${effectiveProfile.formats_accepted.join(", ")}`);

  // Generate candidates from LLM
  let candidates = await generateRecommendations(effectiveProfile, {
    candidateCount: config.candidate_count,
  });

  console.log(`[Orchestrator] LLM returned ${candidates.length} candidates`);
  const totalCandidates = candidates.length;

  // Filter out previously read books
  candidates = filterPreviouslyRead(candidates, profile.previously_read);
  console.log(
    `[Orchestrator] ${candidates.length} candidates after filtering previously read`
  );

  // Filter out disliked authors
  candidates = filterDislikedAuthors(candidates, profile.disliked_authors);
  console.log(
    `[Orchestrator] ${candidates.length} candidates after filtering disliked authors`
  );

  // Check availability for each candidate
  const results: BookResult[] = [];
  for (const candidate of candidates) {
    const result = await checkBookAvailability(candidate, effectiveProfile, options);
    results.push(result);

    // Log availability status
    if (result.meets_criteria) {
      console.log(
        `[Orchestrator] ✓ "${candidate.title}" - ${result.best_option?.source} - $${result.best_option?.price ?? "Free"}`
      );
    } else {
      console.log(
        `[Orchestrator] ✗ "${candidate.title}" - No matching availability`
      );
    }
  }

  // Filter to only books that meet criteria
  const matchingResults = results.filter((r) => r.meets_criteria);

  // Sort by price (free first, then ascending)
  matchingResults.sort((a, b) => {
    const priceA = a.best_option?.price ?? -1;
    const priceB = b.best_option?.price ?? -1;
    return priceA - priceB;
  });

  // Limit to max_results
  const finalResults = matchingResults.slice(0, config.max_results);

  console.log(
    `[Orchestrator] Returning ${finalResults.length} recommendations`
  );

  return {
    recommendations: finalResults,
    filtered_count: results.length - matchingResults.length,
    total_candidates: totalCandidates,
  };
}

/**
 * Get recommendations without loading from profile (use provided profile directly)
 */
export async function getRecommendationsForProfile(
  profile: UserProfile,
  options: OrchestrationOptions = {}
): Promise<RecommendationResponse> {
  const config = getConfig();

  // Apply overrides
  const effectiveProfile: UserProfile = {
    ...profile,
    interests: options.overrideInterests ?? profile.interests,
    price_ceiling: options.overridePriceCeiling ?? profile.price_ceiling,
    formats_accepted: options.overrideFormats ?? profile.formats_accepted,
  };

  console.log(`[Orchestrator] Generating recommendations for provided profile`);
  console.log(`[Orchestrator] Interests: ${effectiveProfile.interests.join(", ")}`);
  console.log(`[Orchestrator] Price ceiling: $${effectiveProfile.price_ceiling}`);
  console.log(`[Orchestrator] Formats: ${effectiveProfile.formats_accepted.join(", ")}`);

  // Generate candidates from LLM
  let candidates = await generateRecommendations(effectiveProfile, {
    candidateCount: config.candidate_count,
  });

  console.log(`[Orchestrator] LLM returned ${candidates.length} candidates`);
  const totalCandidates = candidates.length;

  // Filter out previously read books
  candidates = filterPreviouslyRead(candidates, profile.previously_read);

  // Filter out disliked authors
  candidates = filterDislikedAuthors(candidates, profile.disliked_authors);

  // Check availability for each candidate
  const results: BookResult[] = [];
  for (const candidate of candidates) {
    const result = await checkBookAvailability(candidate, effectiveProfile, options);
    results.push(result);
  }

  // Filter to only books that meet criteria
  const matchingResults = results.filter((r) => r.meets_criteria);

  // Sort by price (free first, then ascending)
  matchingResults.sort((a, b) => {
    const priceA = a.best_option?.price ?? -1;
    const priceB = b.best_option?.price ?? -1;
    return priceA - priceB;
  });

  // Limit to max_results
  const finalResults = matchingResults.slice(0, config.max_results);

  return {
    recommendations: finalResults,
    filtered_count: results.length - matchingResults.length,
    total_candidates: totalCandidates,
  };
}

/**
 * Check availability for a specific ISBN across all sources
 */
export async function checkISBNAvailability(
  isbn: string,
  options: { formats?: BookFormat[]; skipCache?: boolean } = {}
): Promise<AvailabilityRecord[]> {
  const config = getConfig();
  const availability: AvailabilityRecord[] = [];

  const enabledAdapters = config.enabled_sources
    .map((name) => getAdapter(name))
    .filter((adapter) => adapter !== undefined);

  for (const adapter of enabledAdapters) {
    // If specific formats requested, skip adapters that don't support them
    if (options.formats) {
      const supportsFormat = options.formats.some((f) => adapter.supports_format(f));
      if (!supportsFormat) {
        continue;
      }
    }

    // Check cache first
    if (!options.skipCache) {
      const cached = getCachedAvailability(isbn, adapter.name);
      if (cached !== undefined) {
        if (cached !== null) {
          availability.push(cached);
        }
        continue;
      }
    }

    // Query the adapter
    try {
      const record = await adapter.check(isbn);
      setCachedAvailability(isbn, adapter.name, record);

      if (record) {
        availability.push(record);
      }
    } catch (error) {
      console.error(
        `[Orchestrator] Error checking ${adapter.name} for ISBN ${isbn}:`,
        error
      );
    }
  }

  return availability;
}
