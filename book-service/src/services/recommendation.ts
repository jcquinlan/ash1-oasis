import OpenAI from "openai";
import type { UserProfile, BookCandidate, ISBNValidation } from "../types";
import { getConfig } from "../config";

/**
 * Validate ISBN-13 format and check digit
 */
export function validateISBN13(isbn: string): boolean {
  // Remove any hyphens or spaces
  const cleaned = isbn.replace(/[-\s]/g, "");

  // Must be exactly 13 digits
  if (!/^\d{13}$/.test(cleaned)) {
    return false;
  }

  // Validate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  return checkDigit === parseInt(cleaned[12]);
}

/**
 * Validate ISBN-10 format and check digit
 */
export function validateISBN10(isbn: string): boolean {
  // Remove any hyphens or spaces
  const cleaned = isbn.replace(/[-\s]/g, "");

  // Must be exactly 10 characters (last can be X)
  if (!/^\d{9}[\dX]$/i.test(cleaned)) {
    return false;
  }

  // Validate check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned[i]) * (10 - i);
  }

  const lastChar = cleaned[9].toUpperCase();
  const checkDigit = lastChar === "X" ? 10 : parseInt(lastChar);
  sum += checkDigit;

  return sum % 11 === 0;
}

/**
 * Convert ISBN-10 to ISBN-13
 */
export function isbn10to13(isbn10: string): string | null {
  const cleaned = isbn10.replace(/[-\s]/g, "");

  if (!validateISBN10(cleaned)) {
    return null;
  }

  // Add 978 prefix and recalculate check digit
  const base = "978" + cleaned.slice(0, 9);

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  return base + checkDigit;
}

/**
 * Validate and normalize ISBN
 */
export function validateISBN(isbn: string): ISBNValidation {
  const cleaned = isbn.replace(/[-\s]/g, "");

  // Try as ISBN-13
  if (cleaned.length === 13) {
    if (validateISBN13(cleaned)) {
      return {
        valid: true,
        isbn_13: cleaned,
        isbn_10: null, // Could convert but not needed
      };
    }
    return {
      valid: false,
      isbn_13: null,
      isbn_10: null,
      error: "Invalid ISBN-13 check digit",
    };
  }

  // Try as ISBN-10
  if (cleaned.length === 10) {
    if (validateISBN10(cleaned)) {
      return {
        valid: true,
        isbn_13: isbn10to13(cleaned),
        isbn_10: cleaned,
      };
    }
    return {
      valid: false,
      isbn_13: null,
      isbn_10: null,
      error: "Invalid ISBN-10 check digit",
    };
  }

  return {
    valid: false,
    isbn_13: null,
    isbn_10: null,
    error: `Invalid ISBN length: ${cleaned.length} (expected 10 or 13)`,
  };
}

/**
 * Build the prompt for the LLM
 */
function buildPrompt(profile: UserProfile, candidateCount: number): string {
  const interests =
    profile.interests.length > 0
      ? profile.interests.join(", ")
      : "general fiction and non-fiction";

  const previouslyRead =
    profile.previously_read.length > 0
      ? `\n- Books already read (by ISBN): ${profile.previously_read.join(", ")}`
      : "";

  const dislikedAuthors =
    profile.disliked_authors.length > 0
      ? `\n- Authors to avoid: ${profile.disliked_authors.join(", ")}`
      : "";

  return `You are a book recommendation expert. Given the following user profile, recommend ${candidateCount} books that match their interests.

User Profile:
- Interests: ${interests}${previouslyRead}${dislikedAuthors}

IMPORTANT REQUIREMENTS:
1. Each book MUST have a valid ISBN-13 number. Do not make up ISBNs - use only real, verified ISBNs.
2. Recommend a diverse set of books across the user's interests.
3. Include both classics and recent publications when appropriate.
4. Do NOT recommend any books from the "already read" list.
5. Do NOT recommend books by authors in the "avoid" list.

Return your recommendations as a JSON array with the following structure for each book:
{
  "title": "exact book title",
  "author": "author's full name",
  "isbn_13": "13-digit ISBN with no hyphens",
  "isbn_10": "10-digit ISBN if known, otherwise null",
  "publication_year": year as integer,
  "reasoning": "one sentence explaining why this matches the user's interests"
}

Return ONLY the JSON array, no other text.`;
}

/**
 * Parse and validate LLM response
 */
function parseRecommendations(response: string): BookCandidate[] {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Handle markdown code blocks
  if (jsonStr.startsWith("```")) {
    const match = jsonStr.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (match) {
      jsonStr = match[1].trim();
    }
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    throw new Error(`Failed to parse LLM response as JSON: ${error}`);
  }

  // Validate structure
  if (!Array.isArray(parsed)) {
    throw new Error("LLM response is not an array");
  }

  const candidates: BookCandidate[] = [];

  for (const item of parsed) {
    if (typeof item !== "object" || item === null) {
      console.warn("Skipping invalid item in LLM response:", item);
      continue;
    }

    const book = item as Record<string, unknown>;

    // Validate required fields
    if (
      typeof book.title !== "string" ||
      typeof book.author !== "string" ||
      typeof book.isbn_13 !== "string"
    ) {
      console.warn("Skipping item with missing required fields:", book);
      continue;
    }

    // Validate ISBN
    const isbnValidation = validateISBN(book.isbn_13);
    if (!isbnValidation.valid) {
      console.warn(
        `Skipping book "${book.title}" with invalid ISBN: ${isbnValidation.error}`
      );
      continue;
    }

    candidates.push({
      title: book.title,
      author: book.author,
      isbn_13: isbnValidation.isbn_13!,
      isbn_10:
        typeof book.isbn_10 === "string" ? book.isbn_10 : isbnValidation.isbn_10,
      publication_year:
        typeof book.publication_year === "number"
          ? book.publication_year
          : new Date().getFullYear(),
      reasoning:
        typeof book.reasoning === "string"
          ? book.reasoning
          : "Matches user interests",
    });
  }

  return candidates;
}

/**
 * Generate book recommendations using OpenAI
 */
async function generateWithOpenAI(
  profile: UserProfile,
  candidateCount: number
): Promise<BookCandidate[]> {
  const config = getConfig();

  if (!config.openai_api_key) {
    throw new Error("OpenAI API key is not configured");
  }

  const openai = new OpenAI({
    apiKey: config.openai_api_key,
  });

  const prompt = buildPrompt(profile, candidateCount);

  const response = await openai.chat.completions.create({
    model: config.llm_model,
    messages: [
      {
        role: "system",
        content:
          "You are a knowledgeable book recommendation assistant. Always provide accurate ISBN numbers for books.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  return parseRecommendations(content);
}

/**
 * Main function to generate book recommendations
 */
export async function generateRecommendations(
  profile: UserProfile,
  options?: {
    candidateCount?: number;
  }
): Promise<BookCandidate[]> {
  const config = getConfig();
  const candidateCount = options?.candidateCount ?? config.candidate_count;

  if (config.llm_provider === "openai") {
    return generateWithOpenAI(profile, candidateCount);
  }

  // Add other providers here in the future
  throw new Error(`Unsupported LLM provider: ${config.llm_provider}`);
}

/**
 * Filter out books the user has already read
 */
export function filterPreviouslyRead(
  candidates: BookCandidate[],
  previouslyRead: string[]
): BookCandidate[] {
  const readSet = new Set(previouslyRead.map((isbn) => isbn.replace(/[-\s]/g, "")));

  return candidates.filter((book) => {
    const isbn13 = book.isbn_13.replace(/[-\s]/g, "");
    const isbn10 = book.isbn_10?.replace(/[-\s]/g, "");

    return !readSet.has(isbn13) && (!isbn10 || !readSet.has(isbn10));
  });
}

/**
 * Filter out books by disliked authors
 */
export function filterDislikedAuthors(
  candidates: BookCandidate[],
  dislikedAuthors: string[]
): BookCandidate[] {
  const dislikedSet = new Set(
    dislikedAuthors.map((author) => author.toLowerCase().trim())
  );

  return candidates.filter((book) => {
    const authorLower = book.author.toLowerCase().trim();
    return !dislikedSet.has(authorLower);
  });
}
