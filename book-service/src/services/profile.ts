import { readdir, readFile, writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import type { UserProfile, BookFormat } from "../types";
import { getConfig } from "../config";

const DATA_DIR = process.env.BOOK_DATA_DIR || join(import.meta.dir, "../../data/profiles");

async function ensureDataDir(): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists, ignore
  }
}

function getProfilePath(id: string): string {
  // Sanitize ID to prevent directory traversal
  const sanitizedId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return join(DATA_DIR, `${sanitizedId}.json`);
}

export async function createProfile(profile: Omit<UserProfile, "id"> & { id?: string }): Promise<UserProfile> {
  await ensureDataDir();

  const config = getConfig();
  const id = profile.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const fullProfile: UserProfile = {
    id,
    interests: profile.interests || [],
    previously_read: profile.previously_read || [],
    disliked_authors: profile.disliked_authors || [],
    price_ceiling: profile.price_ceiling ?? config.price_ceiling_default,
    formats_accepted: profile.formats_accepted || config.formats_default,
    currency: profile.currency || "USD",
  };

  const path = getProfilePath(id);
  await writeFile(path, JSON.stringify(fullProfile, null, 2), "utf-8");

  return fullProfile;
}

export async function getProfile(id: string): Promise<UserProfile | null> {
  try {
    const path = getProfilePath(id);
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as UserProfile;
  } catch (error) {
    return null;
  }
}

export async function updateProfile(
  id: string,
  updates: Partial<Omit<UserProfile, "id">>
): Promise<UserProfile | null> {
  const existing = await getProfile(id);
  if (!existing) {
    return null;
  }

  const updated: UserProfile = {
    ...existing,
    ...updates,
    id: existing.id, // Ensure ID cannot be changed
  };

  const path = getProfilePath(id);
  await writeFile(path, JSON.stringify(updated, null, 2), "utf-8");

  return updated;
}

export async function deleteProfile(id: string): Promise<boolean> {
  try {
    const path = getProfilePath(id);
    await unlink(path);
    return true;
  } catch (error) {
    return false;
  }
}

export async function listProfiles(): Promise<UserProfile[]> {
  await ensureDataDir();

  try {
    const files = await readdir(DATA_DIR);
    const profiles: UserProfile[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const content = await readFile(join(DATA_DIR, file), "utf-8");
          profiles.push(JSON.parse(content) as UserProfile);
        } catch (error) {
          // Skip invalid files
          console.error(`Failed to parse profile file: ${file}`);
        }
      }
    }

    return profiles;
  } catch (error) {
    return [];
  }
}

export async function addToReadingHistory(id: string, isbn: string): Promise<boolean> {
  const profile = await getProfile(id);
  if (!profile) {
    return false;
  }

  if (!profile.previously_read.includes(isbn)) {
    profile.previously_read.push(isbn);
    await updateProfile(id, { previously_read: profile.previously_read });
  }

  return true;
}

export async function addInterest(id: string, interest: string): Promise<boolean> {
  const profile = await getProfile(id);
  if (!profile) {
    return false;
  }

  const normalizedInterest = interest.toLowerCase().trim();
  if (!profile.interests.includes(normalizedInterest)) {
    profile.interests.push(normalizedInterest);
    await updateProfile(id, { interests: profile.interests });
  }

  return true;
}

export async function removeInterest(id: string, interest: string): Promise<boolean> {
  const profile = await getProfile(id);
  if (!profile) {
    return false;
  }

  const normalizedInterest = interest.toLowerCase().trim();
  const index = profile.interests.indexOf(normalizedInterest);
  if (index > -1) {
    profile.interests.splice(index, 1);
    await updateProfile(id, { interests: profile.interests });
  }

  return true;
}

export async function addDislikedAuthor(id: string, author: string): Promise<boolean> {
  const profile = await getProfile(id);
  if (!profile) {
    return false;
  }

  const normalizedAuthor = author.trim();
  if (!profile.disliked_authors.includes(normalizedAuthor)) {
    profile.disliked_authors.push(normalizedAuthor);
    await updateProfile(id, { disliked_authors: profile.disliked_authors });
  }

  return true;
}
