import type { AvailabilityRecord, BookFormat } from "../../types";
import { BaseSourceAdapter, registerAdapter } from "./interface";

/**
 * Thriftbooks adapter for cheap used physical books
 * Uses web scraping since no official API is available
 *
 * Note: Web scraping adapters are fragile and may break when the site changes.
 * This implementation uses basic fetch + regex parsing.
 */
export class ThriftbooksAdapter extends BaseSourceAdapter {
  name = "thriftbooks";
  rate_limit = { requests_per_minute: 30 }; // Be respectful with scraping

  private readonly BASE_URL = "https://www.thriftbooks.com";

  supports_format(format: BookFormat): boolean {
    // Thriftbooks sells physical books
    return format === "paperback" || format === "hardcover";
  }

  async check(isbn: string): Promise<AvailabilityRecord | null> {
    await this.enforceRateLimit();

    try {
      // Thriftbooks uses ISBN in their search URL
      const searchUrl = `${this.BASE_URL}/browse/?b.search=${isbn}`;

      const response = await this.withRetry(async () => {
        const res = await fetch(searchUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res;
      });

      const html = await response.text();

      // Parse the response to find book info and price
      const result = this.parseSearchResults(html, isbn);

      if (!result) {
        return null;
      }

      return result;
    } catch (error) {
      console.error(`[${this.name}] Error checking ISBN ${isbn}:`, error);
      return null;
    }
  }

  private parseSearchResults(
    html: string,
    isbn: string
  ): AvailabilityRecord | null {
    try {
      // Look for the "AllEditions" or product container with pricing
      // Thriftbooks typically shows "From $X.XX" for used copies

      // Check if we found any results
      if (
        html.includes("No results found") ||
        html.includes("0 Results") ||
        html.includes("did not match any products")
      ) {
        return null;
      }

      // Try to extract the lowest price
      // Pattern: data-price="X.XX" or class containing price with $X.XX
      const pricePatterns = [
        /data-price="(\d+\.?\d*)"/,
        /"price":\s*"?\$?(\d+\.?\d*)"?/,
        /\$(\d+\.?\d*)\s*<\/span>\s*(?:Used|New)/i,
        /From\s*\$(\d+\.?\d*)/i,
        /Starting at\s*\$(\d+\.?\d*)/i,
        /class="[^"]*price[^"]*"[^>]*>\s*\$?(\d+\.?\d*)/i,
      ];

      let lowestPrice: number | null = null;

      for (const pattern of pricePatterns) {
        const matches = html.match(new RegExp(pattern, "g"));
        if (matches) {
          for (const match of matches) {
            const priceMatch = pattern.exec(match);
            if (priceMatch && priceMatch[1]) {
              const price = parseFloat(priceMatch[1]);
              if (!isNaN(price) && price > 0 && price < 1000) {
                // Sanity check
                if (lowestPrice === null || price < lowestPrice) {
                  lowestPrice = price;
                }
              }
            }
          }
        }
      }

      // Try to determine the format (paperback vs hardcover)
      // Default to paperback as it's most common for used books
      let format: BookFormat = "paperback";
      if (
        html.toLowerCase().includes("hardcover") &&
        !html.toLowerCase().includes("paperback")
      ) {
        format = "hardcover";
      }

      // Extract product URL if available
      const urlMatch = html.match(
        /href="(\/[^"]*(?:isbn|book)[^"]*)" [^>]*class="[^"]*(?:title|product)/i
      );
      const productPath = urlMatch ? urlMatch[1] : `/browse/?b.search=${isbn}`;

      // If we found a price, the book is available
      if (lowestPrice !== null) {
        return {
          source: this.name,
          format,
          price: lowestPrice,
          currency: "USD",
          url: `${this.BASE_URL}${productPath}`,
          estimated_delivery: "3-5 days",
          in_stock: true,
        };
      }

      // Check if the page shows the book exists but is out of stock
      if (
        html.includes("Out of Stock") ||
        html.includes("Currently Unavailable")
      ) {
        return {
          source: this.name,
          format,
          price: null,
          currency: "USD",
          url: `${this.BASE_URL}${productPath}`,
          estimated_delivery: "unknown",
          in_stock: false,
        };
      }

      return null;
    } catch (error) {
      console.error(`[${this.name}] Error parsing HTML for ISBN ${isbn}:`, error);
      return null;
    }
  }

  /**
   * Alternative: Use Thriftbooks search API if available
   * This is a fallback in case scraping becomes unreliable
   */
  async searchByISBN(isbn: string): Promise<{
    found: boolean;
    url: string | null;
  }> {
    await this.enforceRateLimit();

    try {
      // Thriftbooks may have an internal API for search suggestions
      const suggestUrl = `${this.BASE_URL}/api/suggest?q=${isbn}`;

      const response = await fetch(suggestUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return { found: false, url: null };
      }

      const data = await response.json();

      // Check if the API returned any results
      if (data && Array.isArray(data) && data.length > 0) {
        const firstResult = data[0];
        return {
          found: true,
          url: firstResult.url
            ? `${this.BASE_URL}${firstResult.url}`
            : `${this.BASE_URL}/browse/?b.search=${isbn}`,
        };
      }

      return { found: false, url: null };
    } catch (error) {
      // API might not exist, that's okay
      return { found: false, url: null };
    }
  }
}

// Create and register the adapter
const thriftbooksAdapter = new ThriftbooksAdapter();
registerAdapter(thriftbooksAdapter);

export default thriftbooksAdapter;
