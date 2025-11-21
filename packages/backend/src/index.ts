import type { DefineAPI, DefineEvents, SDK } from "caido:plugin";
import { fetch } from "caido:http";

import {
  cancelScan,
  getScanResults,
  getScanStatus,
  startScan,
} from "./scanner.js";

// Result type for error handling
export type Result<T> =
  | { kind: "Error"; error: string }
  | { kind: "Ok"; value: T };

// Backend events
export type BackendEvents = DefineEvents<{
  "scan-progress": (data: {
    scanId: string;
    current: number;
    total: number;
    currentDomains: string[];
  }) => void;
  "scan-complete": (data: {
    scanId: string;
    results: {
      internalCount: number;
      externalCount: number;
      combinedCount: number;
      totalDomains: number;
    };
  }) => void;
}>;

// API function implementations
function startScanAPI(
  sdk: SDK<API, BackendEvents>,
  domains: string[],
  timeout: number,
  concurrency: number,
): Result<{ scanId: string }> {
  sdk.console.log(
    `[SURF - API] startScan called with ${domains.length} domains, timeout=${timeout}ms, concurrency=${concurrency}`,
  );

  try {
    if (domains.length === 0) {
      sdk.console.log(
        "[SURF - API] startScan validation failed: No domains provided",
      );
      return { kind: "Error", error: "No domains provided" };
    }

    if (timeout <= 0) {
      sdk.console.log(
        `[SURF - API] startScan validation failed: Invalid timeout=${timeout}`,
      );
      return { kind: "Error", error: "Timeout must be greater than 0" };
    }

    if (concurrency <= 0) {
      sdk.console.log(
        `[SURF - API] startScan validation failed: Invalid concurrency=${concurrency}`,
      );
      return { kind: "Error", error: "Concurrency must be greater than 0" };
    }

    const scanId = `scan-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    sdk.console.log(
      `[SURF - API] Creating scan ${scanId} with ${domains.length} domains`,
    );

    startScan(
      scanId,
      domains,
      timeout,
      concurrency,
      (status) => {
        // Emit progress event
        sdk.api.send("scan-progress", {
          scanId: status.scanId,
          current: status.completed,
          total: status.total,
          currentDomains: status.current,
        });
      },
      (results) => {
        sdk.console.log(
          `[SURF - API] Scan ${scanId} completed: ${results.internal.length} internal, ${results.external.length} external, ${results.combined.length} total`,
        );
        // Emit completion event with counts only
        sdk.api.send("scan-complete", {
          scanId,
          results: {
            internalCount: results.internal.length,
            externalCount: results.external.length,
            combinedCount: results.combined.length,
            totalDomains: results.totalDomains,
          },
        });
      },
    );

    sdk.console.log(`[SURF - API] startScan successful, scanId=${scanId}`);
    return { kind: "Ok", value: { scanId } };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] startScan error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function getScanStatusAPI(
  sdk: SDK<API, BackendEvents>,
  scanId: string,
): Result<{
  total: number;
  completed: number;
  current: string[];
  internalCount: number;
  externalCount: number;
  failedCount: number;
  isComplete: boolean;
}> {
  // sdk.console.log(`[SURF - API] getScanStatus called for scanId=${scanId}`);

  try {
    const status = getScanStatus(scanId);

    if (status === undefined) {
      sdk.console.log(`[SURF - API] getScanStatus: Scan ${scanId} not found`);
      return { kind: "Error", error: "Scan not found" };
    }

    const result = {
      total: status.total,
      completed: status.completed,
      current: status.current,
      internalCount: status.internalHosts.size,
      externalCount: status.externalHosts.size,
      failedCount: status.failedHosts.length,
      isComplete: status.isComplete,
    };

    // sdk.console.log(`[SURF - API] getScanStatus: ${scanId} - ${result.completed}/${result.total} completed, ${result.internalCount} internal, ${result.externalCount} external, ${result.failedCount} failed`);
    return { kind: "Ok", value: result };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] getScanStatus error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function getScanResultsAPI(
  sdk: SDK<API, BackendEvents>,
  scanId: string,
): Result<{
  internalCount: number;
  externalCount: number;
  combinedCount: number;
  totalDomains: number;
}> {
  sdk.console.log(`[SURF - API] getScanResults called for scanId=${scanId}`);

  try {
    const results = getScanResults(scanId);

    if (results === undefined) {
      sdk.console.log(
        `[SURF - API] getScanResults: Scan ${scanId} not found or not complete`,
      );
      return { kind: "Error", error: "Scan not found or not complete" };
    }

    sdk.console.log(
      `[SURF - API] getScanResults: ${scanId} - ${results.internal.length} internal, ${results.external.length} external, ${results.combined.length} total`,
    );
    return {
      kind: "Ok",
      value: {
        internalCount: results.internal.length,
        externalCount: results.external.length,
        combinedCount: results.combined.length,
        totalDomains: results.totalDomains,
      },
    };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] getScanResults error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uploadInternalIPsToFilesAPI(
  sdk: SDK<API, BackendEvents>,
  scanId: string,
  prependProtocol: boolean,
): Promise<Result<string>> {
  sdk.console.log(
    `[SURF - API] uploadInternalIPsToFiles called for scan ${scanId}, prependProtocol=${prependProtocol}`,
  );

  try {
    const results = getScanResults(scanId);

    if (results === undefined) {
      sdk.console.log(
        `[SURF - API] uploadInternalIPsToFiles: Scan ${scanId} not found or not complete`,
      );
      return { kind: "Error", error: "Scan not found or not complete" };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `surf-internal-${timestamp}.txt`;

    let content: string;
    if (prependProtocol) {
      const urls: string[] = [];
      for (const host of results.internal) {
        urls.push(`https://${host}`);
        urls.push(`http://${host}`);
      }
      content = urls.join("\n");
    } else {
      content = results.internal.join("\n");
    }

    const file = await sdk.hostedFile.create({
      name: fileName,
      content: content,
    });

    const itemCount = prependProtocol
      ? results.internal.length * 2
      : results.internal.length;
    sdk.console.log(
      `[SURF - API] Successfully created internal IPs file: ${
        file.name
      } (${itemCount} ${prependProtocol ? "URLs" : "hosts"})`,
    );

    return { kind: "Ok", value: file.name };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] uploadInternalIPsToFiles error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uploadExternalIPsToFilesAPI(
  sdk: SDK<API, BackendEvents>,
  scanId: string,
  prependProtocol: boolean,
): Promise<Result<string>> {
  sdk.console.log(
    `[SURF - API] uploadExternalIPsToFiles called for scan ${scanId}, prependProtocol=${prependProtocol}`,
  );

  try {
    const results = getScanResults(scanId);

    if (results === undefined) {
      sdk.console.log(
        `[SURF - API] uploadExternalIPsToFiles: Scan ${scanId} not found or not complete`,
      );
      return { kind: "Error", error: "Scan not found or not complete" };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `surf-external-${timestamp}.txt`;

    let content: string;
    if (prependProtocol) {
      const urls: string[] = [];
      for (const host of results.external) {
        urls.push(`https://${host}`);
        urls.push(`http://${host}`);
      }
      content = urls.join("\n");
    } else {
      content = results.external.join("\n");
    }

    const file = await sdk.hostedFile.create({
      name: fileName,
      content: content,
    });

    const itemCount = prependProtocol
      ? results.external.length * 2
      : results.external.length;
    sdk.console.log(
      `[SURF - API] Successfully created external IPs file: ${
        file.name
      } (${itemCount} ${prependProtocol ? "URLs" : "hosts"})`,
    );

    return { kind: "Ok", value: file.name };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] uploadExternalIPsToFiles error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uploadCombinedWordlistToFilesAPI(
  sdk: SDK<API, BackendEvents>,
  scanId: string,
  prependProtocol: boolean,
): Promise<Result<string>> {
  sdk.console.log(
    `[SURF - API] uploadCombinedWordlistToFiles called for scan ${scanId}, prependProtocol=${prependProtocol}`,
  );

  try {
    const results = getScanResults(scanId);

    if (results === undefined) {
      sdk.console.log(
        `[SURF - API] uploadCombinedWordlistToFiles: Scan ${scanId} not found or not complete`,
      );
      return { kind: "Error", error: "Scan not found or not complete" };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `surf-combined-${timestamp}.txt`;

    let content: string;
    if (prependProtocol) {
      const urls: string[] = [];
      for (const host of results.combined) {
        urls.push(`https://${host}`);
        urls.push(`http://${host}`);
      }
      content = urls.join("\n");
    } else {
      content = results.combined.join("\n");
    }

    const file = await sdk.hostedFile.create({
      name: fileName,
      content: content,
    });

    const itemCount = prependProtocol
      ? results.combined.length * 2
      : results.combined.length;
    sdk.console.log(
      `[SURF - API] Successfully created combined wordlist file: ${
        file.name
      } (${itemCount} ${prependProtocol ? "URLs" : "hosts"})`,
    );

    return { kind: "Ok", value: file.name };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] uploadCombinedWordlistToFiles error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function downloadInternalIPsAPI(
  sdk: SDK<API, BackendEvents>,
  scanId: string,
  prependProtocol: boolean,
): Result<string> {
  sdk.console.log(
    `[SURF - API] downloadInternalIPs called for scan ${scanId}, prependProtocol=${prependProtocol}`,
  );

  try {
    const results = getScanResults(scanId);

    if (results === undefined) {
      sdk.console.log(
        `[SURF - API] downloadInternalIPs: Scan ${scanId} not found or not complete`,
      );
      return { kind: "Error", error: "Scan not found or not complete" };
    }

    let content: string;
    if (prependProtocol) {
      const urls: string[] = [];
      for (const host of results.internal) {
        urls.push(`https://${host}`);
        urls.push(`http://${host}`);
      }
      content = urls.join("\n");
    } else {
      content = results.internal.join("\n");
    }

    return { kind: "Ok", value: content };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] downloadInternalIPs error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function downloadExternalIPsAPI(
  sdk: SDK<API, BackendEvents>,
  scanId: string,
  prependProtocol: boolean,
): Result<string> {
  sdk.console.log(
    `[SURF - API] downloadExternalIPs called for scan ${scanId}, prependProtocol=${prependProtocol}`,
  );

  try {
    const results = getScanResults(scanId);

    if (results === undefined) {
      sdk.console.log(
        `[SURF - API] downloadExternalIPs: Scan ${scanId} not found or not complete`,
      );
      return { kind: "Error", error: "Scan not found or not complete" };
    }

    let content: string;
    if (prependProtocol) {
      const urls: string[] = [];
      for (const host of results.external) {
        urls.push(`https://${host}`);
        urls.push(`http://${host}`);
      }
      content = urls.join("\n");
    } else {
      content = results.external.join("\n");
    }

    return { kind: "Ok", value: content };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] downloadExternalIPs error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function downloadCombinedWordlistAPI(
  sdk: SDK<API, BackendEvents>,
  scanId: string,
  prependProtocol: boolean,
): Result<string> {
  sdk.console.log(
    `[SURF - API] downloadCombinedWordlist called for scan ${scanId}, prependProtocol=${prependProtocol}`,
  );

  try {
    const results = getScanResults(scanId);

    if (results === undefined) {
      sdk.console.log(
        `[SURF - API] downloadCombinedWordlist: Scan ${scanId} not found or not complete`,
      );
      return { kind: "Error", error: "Scan not found or not complete" };
    }

    let content: string;
    if (prependProtocol) {
      const urls: string[] = [];
      for (const host of results.combined) {
        urls.push(`https://${host}`);
        urls.push(`http://${host}`);
      }
      content = urls.join("\n");
    } else {
      content = results.combined.join("\n");
    }

    return { kind: "Ok", value: content };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] downloadCombinedWordlist error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function cancelScanAPI(
  sdk: SDK<API, BackendEvents>,
  scanId: string,
): Result<void> {
  sdk.console.log(`[SURF - API] cancelScan called for scanId=${scanId}`);

  try {
    const cancelled = cancelScan(scanId);
    if (!cancelled) {
      sdk.console.log(
        `[SURF - API] cancelScan: Scan ${scanId} not found or already completed`,
      );
      return { kind: "Error", error: "Scan not found or already completed" };
    }
    sdk.console.log(
      `[SURF - API] cancelScan: Successfully cancelled scan ${scanId}`,
    );
    return { kind: "Ok", value: undefined };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] cancelScan error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uploadWordlistFromUrlAPI(
  sdk: SDK<API, BackendEvents>,
  url: string,
  filename: string,
): Promise<Result<string>> {
  sdk.console.log(
    `[SURF - API] uploadWordlistFromUrl called for ${filename} from ${url}`,
  );

  try {
    // Download the file from the CDN
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download wordlist: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const content = await response.text();

    // Upload to Caido
    const file = await sdk.hostedFile.create({
      name: filename,
      content: content,
    });

    sdk.console.log(
      `[SURF - API] Successfully uploaded wordlist ${filename} to Caido`,
    );

    return { kind: "Ok", value: file.name };
  } catch (error) {
    sdk.console.log(
      `[SURF - API] uploadWordlistFromUrl error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {
      kind: "Error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Export the API type definition
export type API = DefineAPI<{
  startScan: typeof startScanAPI;
  getScanStatus: typeof getScanStatusAPI;
  getScanResults: typeof getScanResultsAPI;
  uploadInternalIPsToFiles: typeof uploadInternalIPsToFilesAPI;
  uploadExternalIPsToFiles: typeof uploadExternalIPsToFilesAPI;
  uploadCombinedWordlistToFiles: typeof uploadCombinedWordlistToFilesAPI;
  downloadInternalIPs: typeof downloadInternalIPsAPI;
  downloadExternalIPs: typeof downloadExternalIPsAPI;
  downloadCombinedWordlist: typeof downloadCombinedWordlistAPI;
  cancelScan: typeof cancelScanAPI;
  uploadWordlistFromUrl: typeof uploadWordlistFromUrlAPI;
}>;

// Plugin initialization
export function init(sdk: SDK<API, BackendEvents>) {
  sdk.console.log("[SURF - Plugin] Initializing Surf backend plugin");
  sdk.api.register("startScan", startScanAPI);
  sdk.api.register("getScanStatus", getScanStatusAPI);
  sdk.api.register("getScanResults", getScanResultsAPI);
  sdk.api.register("uploadInternalIPsToFiles", uploadInternalIPsToFilesAPI);
  sdk.api.register("uploadExternalIPsToFiles", uploadExternalIPsToFilesAPI);
  sdk.api.register(
    "uploadCombinedWordlistToFiles",
    uploadCombinedWordlistToFilesAPI,
  );
  sdk.api.register("downloadInternalIPs", downloadInternalIPsAPI);
  sdk.api.register("downloadExternalIPs", downloadExternalIPsAPI);
  sdk.api.register("downloadCombinedWordlist", downloadCombinedWordlistAPI);
  sdk.api.register("cancelScan", cancelScanAPI);
  sdk.api.register("uploadWordlistFromUrl", uploadWordlistFromUrlAPI);
  sdk.console.log(
    "[SURF - Plugin] Surf backend plugin initialized successfully",
  );
}
