import type { AvailabilityRecord, BookFormat } from "../../types";
import { BaseSourceAdapter, registerAdapter } from "./interface";

interface OpenLibraryEdition {
  key: string;
  title: string;
  authors?: Array<{ key: string }>;
  publishers?: string[];
  publish_date?: string;
  isbn_13?: string[];
  isbn_10?: string[];
  covers?: number[];
  number_of_pages?: number;
  physical_format?: string;
}

interface OpenLibraryAvailability {
  status: string;
  available_to_borrow?: boolean;
  available_to_browse?: boolean;
  is_readable?: boolean;
  is_lendable?: boolean;
  is_previewable?: boolean;
  identifier?: string;
  openlibrary_edition?: string;
}

interface OpenLibraryBooksResponse {
  [key: string]: {
    bib_key: string;
    info_url: string;
    preview: string;
    preview_url?: string;
    thumbnail_url?: string;
    details?: OpenLibraryEdition;
  };
}

/**
 * Open Library API adapter for free ebook availability
 * API Documentation: https://openlibrary.org/developers/api
 */
export class OpenLibraryAdapter extends BaseSourceAdapter {
  name = "open_library";
  rate_limit = { requests_per_minute: 100 }; // Open Library is generous with rate limits

  private readonly BASE_URL = "https://openlibrary.org";
  private readonly API_URL = "https://openlibrary.org/api";

  supports_format(format: BookFormat): boolean {
    // Open Library primarily offers ebooks
    return format === "ebook";
  }

  async check(isbn: string): Promise<AvailabilityRecord | null> {
    await this.enforceRateLimit();

    try {
      // First, try to get book info and availability
      const availability = await this.checkAvailability(isbn);

      if (!availability) {
        return null;
      }

      return availability;
    } catch (error) {
      console.error(`[${this.name}] Error checking ISBN ${isbn}:`, error);
      return null;
    }
  }

  private async checkAvailability(isbn: string): Promise<AvailabilityRecord | null> {
    // Use the Books API to get information about the book
    const booksUrl = `${this.BASE_URL}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=details`;

    const response = await this.withRetry(async () => {
      const res = await fetch(booksUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res;
    });

    const data = (await response.json()) as OpenLibraryBooksResponse;
    const bookKey = `ISBN:${isbn}`;
    const bookInfo = data[bookKey];

    if (!bookInfo) {
      // Book not found in Open Library
      return null;
    }

    // Check if the book has a readable/borrowable version
    const editionKey = bookInfo.details?.key;
    if (!editionKey) {
      return null;
    }

    // Check availability for borrowing/reading
    const availabilityUrl = `${this.BASE_URL}/api/volumes/brief/isbn/${isbn}.json`;

    try {
      const availResponse = await this.withRetry(async () => {
        const res = await fetch(availabilityUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res;
      });

      const availData = await availResponse.json();

      // Check if any edition is available to read
      const records = availData?.records || {};
      let isReadable = false;
      let isBorrowable = false;

      for (const record of Object.values(records) as any[]) {
        if (record?.data?.ebooks) {
          for (const ebook of record.data.ebooks) {
            if (ebook.availability === "open" || ebook.availability === "borrow_available") {
              isReadable = true;
            }
            if (ebook.availability === "borrow_available") {
              isBorrowable = true;
            }
          }
        }
      }

      // Also check the preview availability
      if (bookInfo.preview === "full" || bookInfo.preview === "borrow") {
        isReadable = true;
      }

      if (!isReadable && !isBorrowable) {
        // Book exists but no free ebook available
        return null;
      }

      return {
        source: this.name,
        format: "ebook",
        price: null, // Free
        currency: "USD",
        url: bookInfo.preview_url || bookInfo.info_url,
        estimated_delivery: "instant",
        in_stock: true,
      };
    } catch (error) {
      // If availability API fails, fall back to basic check
      // If preview is "full", we can still consider it available
      if (bookInfo.preview === "full") {
        return {
          source: this.name,
          format: "ebook",
          price: null,
          currency: "USD",
          url: bookInfo.preview_url || bookInfo.info_url,
          estimated_delivery: "instant",
          in_stock: true,
        };
      }

      return null;
    }
  }

  /**
   * Search Open Library for a book by title and author
   * Useful for verifying LLM recommendations
   */
  async searchBook(
    title: string,
    author?: string
  ): Promise<{ isbn_13: string | null; isbn_10: string | null; found: boolean }> {
    await this.enforceRateLimit();

    try {
      let query = `title:${encodeURIComponent(title)}`;
      if (author) {
        query += `+author:${encodeURIComponent(author)}`;
      }

      const searchUrl = `${this.BASE_URL}/search.json?q=${query}&limit=5`;

      const response = await this.withRetry(async () => {
        const res = await fetch(searchUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res;
      });

      const data = await response.json();

      if (data.docs && data.docs.length > 0) {
        const firstResult = data.docs[0];
        return {
          isbn_13: firstResult.isbn?.[0] || null,
          isbn_10: null, // Search API doesn't distinguish between ISBN-10 and ISBN-13
          found: true,
        };
      }

      return { isbn_13: null, isbn_10: null, found: false };
    } catch (error) {
      console.error(`[${this.name}] Error searching for "${title}":`, error);
      return { isbn_13: null, isbn_10: null, found: false };
    }
  }

  /**
   * Verify an ISBN exists in Open Library
   */
  async verifyISBN(isbn: string): Promise<boolean> {
    await this.enforceRateLimit();

    try {
      const booksUrl = `${this.BASE_URL}/api/books?bibkeys=ISBN:${isbn}&format=json`;

      const response = await this.withRetry(async () => {
        const res = await fetch(booksUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res;
      });

      const data = await response.json();
      return Object.keys(data).length > 0;
    } catch (error) {
      console.error(`[${this.name}] Error verifying ISBN ${isbn}:`, error);
      return false;
    }
  }
}

// Create and register the adapter
const openLibraryAdapter = new OpenLibraryAdapter();
registerAdapter(openLibraryAdapter);

export default openLibraryAdapter;
