// Export the interface and registration functions
export {
  BaseSourceAdapter,
  registerAdapter,
  getAdapter,
  getAllAdapters,
  getAdaptersForFormat,
  getAdapterNames,
} from "./interface";

// Import adapters to trigger their registration
import "./openLibrary";
import "./thriftbooks";

// Re-export adapters for direct access if needed
export { default as openLibraryAdapter } from "./openLibrary";
export { default as thriftbooksAdapter } from "./thriftbooks";
