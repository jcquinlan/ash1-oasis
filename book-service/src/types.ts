// User Profile Types
export interface UserProfile {
  id: string;
  interests: string[]; // e.g., ["stoicism", "software architecture", "roman history"]
  previously_read: string[]; // ISBNs to avoid re-recommending
  disliked_authors: string[]; // optional exclusions
  price_ceiling: number; // max price in user's currency
  formats_accepted: BookFormat[]; // ["ebook", "paperback", "hardcover"]
  currency: string; // e.g., "USD"
}

export type BookFormat = "ebook" | "paperback" | "hardcover" | "audiobook";

// Book Candidate Types (from LLM)
export interface BookCandidate {
  title: string;
  author: string;
  isbn_13: string; // critical for downstream lookups
  isbn_10: string | null; // some sources use this
  reasoning: string; // why this was recommended
  publication_year: number;
}

// Availability Types
export interface AvailabilityRecord {
  source: string; // "open_library", "thriftbooks", "amazon", etc.
  format: BookFormat;
  price: number | null; // null = free
  currency: string;
  url: string; // direct link to purchase/download
  estimated_delivery: string; // "instant", "3-5 days", "1-2 weeks"
  in_stock: boolean;
}

export interface BookResult {
  candidate: BookCandidate;
  availability: AvailabilityRecord[];
  best_option: AvailabilityRecord | null; // cheapest that meets criteria
  meets_criteria: boolean;
}

// Source Adapter Interface
export interface SourceAdapter {
  name: string;
  check(isbn: string): Promise<AvailabilityRecord | null>;
  supports_format(format: BookFormat): boolean;
  rate_limit: { requests_per_minute: number };
}

// Cache Types
export interface CacheEntry<T> {
  data: T;
  expires_at: number; // Unix timestamp
}

export interface CacheKey {
  isbn: string;
  source: string;
}

// Configuration Types
export interface Config {
  price_ceiling_default: number;
  formats_default: BookFormat[];
  candidate_count: number; // how many to request from LLM
  max_results: number; // how many to return to user
  cache_ttl_hours: number;
  enabled_sources: string[];
  llm_provider: "openai" | "anthropic";
  llm_model: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
}

// LLM Response Types
export interface LLMRecommendationResponse {
  books: BookCandidate[];
}

// API Response Types
export interface RecommendationRequest {
  profile_id: string;
  override_interests?: string[];
  override_price_ceiling?: number;
  override_formats?: BookFormat[];
}

export interface RecommendationResponse {
  recommendations: BookResult[];
  filtered_count: number; // how many were filtered out
  total_candidates: number; // how many the LLM suggested
}

// ISBN Validation Result
export interface ISBNValidation {
  valid: boolean;
  isbn_13: string | null;
  isbn_10: string | null;
  error?: string;
}
