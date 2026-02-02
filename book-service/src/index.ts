import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig, validateConfig, getConfig } from "./config";
import {
  createProfile,
  getProfile,
  updateProfile,
  deleteProfile,
  listProfiles,
  addToReadingHistory,
  addInterest,
  removeInterest,
  addDislikedAuthor,
} from "./services/profile";
import {
  getRecommendations,
  getRecommendationsForProfile,
  checkISBNAvailability,
} from "./services/orchestrator";
import { validateISBN } from "./services/recommendation";
import {
  getCacheStats,
  clearCache,
  pruneExpired,
  getCachedAvailability,
} from "./services/cache";
import { getAdapterNames } from "./services/availability";
import type { UserProfile, BookFormat } from "./types";

// Initialize adapters by importing them
import "./services/availability";

const app = new Hono();
const port = parseInt(process.env.PORT || "3002", 10);

// Enable CORS
app.use("/*", cors());

// Validate configuration on startup
const config = loadConfig();
const configErrors = validateConfig(config);
if (configErrors.length > 0) {
  console.warn("Configuration warnings:");
  for (const error of configErrors) {
    console.warn(`  - ${error}`);
  }
}

// Health check endpoint
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    service: "book-service",
    adapters: getAdapterNames(),
  });
});

// ============================================================================
// Profile Endpoints
// ============================================================================

// List all profiles
app.get("/api/profiles", async (c) => {
  try {
    const profiles = await listProfiles();
    return c.json({ profiles });
  } catch (error) {
    console.error("Error listing profiles:", error);
    return c.json(
      { error: "Failed to list profiles", status: 500 },
      500
    );
  }
});

// Get a specific profile
app.get("/api/profiles/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const profile = await getProfile(id);

    if (!profile) {
      return c.json({ error: "Profile not found", status: 404 }, 404);
    }

    return c.json(profile);
  } catch (error) {
    console.error("Error getting profile:", error);
    return c.json(
      { error: "Failed to get profile", status: 500 },
      500
    );
  }
});

// Create a new profile
app.post("/api/profiles", async (c) => {
  try {
    const body = await c.req.json();

    const profile = await createProfile({
      id: body.id,
      interests: body.interests || [],
      previously_read: body.previously_read || [],
      disliked_authors: body.disliked_authors || [],
      price_ceiling: body.price_ceiling,
      formats_accepted: body.formats_accepted,
      currency: body.currency || "USD",
    });

    return c.json(profile, 201);
  } catch (error) {
    console.error("Error creating profile:", error);
    return c.json(
      { error: "Failed to create profile", status: 500 },
      500
    );
  }
});

// Update a profile
app.put("/api/profiles/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    const profile = await updateProfile(id, body);

    if (!profile) {
      return c.json({ error: "Profile not found", status: 404 }, 404);
    }

    return c.json(profile);
  } catch (error) {
    console.error("Error updating profile:", error);
    return c.json(
      { error: "Failed to update profile", status: 500 },
      500
    );
  }
});

// Delete a profile
app.delete("/api/profiles/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const success = await deleteProfile(id);

    if (!success) {
      return c.json({ error: "Profile not found", status: 404 }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting profile:", error);
    return c.json(
      { error: "Failed to delete profile", status: 500 },
      500
    );
  }
});

// Add book to reading history
app.post("/api/profiles/:id/history", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    if (!body.isbn) {
      return c.json({ error: "ISBN is required", status: 400 }, 400);
    }

    const validation = validateISBN(body.isbn);
    if (!validation.valid) {
      return c.json(
        { error: `Invalid ISBN: ${validation.error}`, status: 400 },
        400
      );
    }

    const success = await addToReadingHistory(id, validation.isbn_13!);

    if (!success) {
      return c.json({ error: "Profile not found", status: 404 }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error adding to reading history:", error);
    return c.json(
      { error: "Failed to add to reading history", status: 500 },
      500
    );
  }
});

// Add interest to profile
app.post("/api/profiles/:id/interests", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    if (!body.interest) {
      return c.json({ error: "Interest is required", status: 400 }, 400);
    }

    const success = await addInterest(id, body.interest);

    if (!success) {
      return c.json({ error: "Profile not found", status: 404 }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error adding interest:", error);
    return c.json(
      { error: "Failed to add interest", status: 500 },
      500
    );
  }
});

// Remove interest from profile
app.delete("/api/profiles/:id/interests/:interest", async (c) => {
  try {
    const id = c.req.param("id");
    const interest = decodeURIComponent(c.req.param("interest"));

    const success = await removeInterest(id, interest);

    if (!success) {
      return c.json({ error: "Profile not found", status: 404 }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error removing interest:", error);
    return c.json(
      { error: "Failed to remove interest", status: 500 },
      500
    );
  }
});

// Add disliked author
app.post("/api/profiles/:id/disliked-authors", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    if (!body.author) {
      return c.json({ error: "Author is required", status: 400 }, 400);
    }

    const success = await addDislikedAuthor(id, body.author);

    if (!success) {
      return c.json({ error: "Profile not found", status: 404 }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error adding disliked author:", error);
    return c.json(
      { error: "Failed to add disliked author", status: 500 },
      500
    );
  }
});

// ============================================================================
// Recommendation Endpoints
// ============================================================================

// Get recommendations for a profile
app.get("/api/recommendations/:profileId", async (c) => {
  try {
    const profileId = c.req.param("profileId");
    const query = c.req.query();

    const options = {
      overrideInterests: query.interests?.split(","),
      overridePriceCeiling: query.price ? parseFloat(query.price) : undefined,
      overrideFormats: query.formats?.split(",") as BookFormat[] | undefined,
      skipCache: query.skipCache === "true",
    };

    const result = await getRecommendations(profileId, options);
    return c.json(result);
  } catch (error) {
    console.error("Error getting recommendations:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("not found")) {
      return c.json({ error: message, status: 404 }, 404);
    }

    return c.json(
      { error: "Failed to get recommendations", status: 500 },
      500
    );
  }
});

// Get recommendations with profile in request body (for anonymous/temporary use)
app.post("/api/recommendations", async (c) => {
  try {
    const body = await c.req.json();

    if (!body.interests || !Array.isArray(body.interests) || body.interests.length === 0) {
      return c.json(
        { error: "interests array is required", status: 400 },
        400
      );
    }

    const profile: UserProfile = {
      id: "anonymous",
      interests: body.interests,
      previously_read: body.previously_read || [],
      disliked_authors: body.disliked_authors || [],
      price_ceiling: body.price_ceiling ?? getConfig().price_ceiling_default,
      formats_accepted: body.formats_accepted ?? getConfig().formats_default,
      currency: body.currency || "USD",
    };

    const options = {
      skipCache: body.skipCache === true,
    };

    const result = await getRecommendationsForProfile(profile, options);
    return c.json(result);
  } catch (error) {
    console.error("Error getting recommendations:", error);
    return c.json(
      { error: "Failed to get recommendations", status: 500 },
      500
    );
  }
});

// ============================================================================
// Availability Endpoints
// ============================================================================

// Check availability for a specific ISBN
app.get("/api/availability/:isbn", async (c) => {
  try {
    const isbn = c.req.param("isbn");
    const query = c.req.query();

    // Validate ISBN
    const validation = validateISBN(isbn);
    if (!validation.valid) {
      return c.json(
        { error: `Invalid ISBN: ${validation.error}`, status: 400 },
        400
      );
    }

    const options = {
      formats: query.formats?.split(",") as BookFormat[] | undefined,
      skipCache: query.skipCache === "true",
    };

    const availability = await checkISBNAvailability(validation.isbn_13!, options);

    return c.json({
      isbn: validation.isbn_13,
      isbn_10: validation.isbn_10,
      availability,
    });
  } catch (error) {
    console.error("Error checking availability:", error);
    return c.json(
      { error: "Failed to check availability", status: 500 },
      500
    );
  }
});

// ============================================================================
// Cache Management Endpoints
// ============================================================================

// Get cache statistics
app.get("/api/cache/stats", (c) => {
  const stats = getCacheStats();
  return c.json(stats);
});

// Clear all cache
app.delete("/api/cache", (c) => {
  const count = clearCache();
  return c.json({ cleared: count });
});

// Prune expired cache entries
app.post("/api/cache/prune", (c) => {
  const count = pruneExpired();
  return c.json({ pruned: count });
});

// ============================================================================
// Configuration Endpoints
// ============================================================================

// Get current configuration (without secrets)
app.get("/api/config", (c) => {
  const cfg = getConfig();
  return c.json({
    price_ceiling_default: cfg.price_ceiling_default,
    formats_default: cfg.formats_default,
    candidate_count: cfg.candidate_count,
    max_results: cfg.max_results,
    cache_ttl_hours: cfg.cache_ttl_hours,
    enabled_sources: cfg.enabled_sources,
    llm_provider: cfg.llm_provider,
    llm_model: cfg.llm_model,
    // Don't expose API keys
    has_openai_key: !!cfg.openai_api_key,
    has_anthropic_key: !!cfg.anthropic_api_key,
  });
});

// ============================================================================
// ISBN Validation Endpoint
// ============================================================================

// Validate an ISBN
app.get("/api/validate/:isbn", (c) => {
  const isbn = c.req.param("isbn");
  const validation = validateISBN(isbn);
  return c.json(validation);
});

console.log(`Book Service starting on port ${port}`);
console.log(`Enabled sources: ${getAdapterNames().join(", ")}`);

export default {
  port,
  fetch: app.fetch,
};
