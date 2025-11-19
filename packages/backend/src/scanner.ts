/**
 * Main scanning orchestration
 * Coordinates DNS resolution, HTTP probing, concurrency control, and progress tracking
 */

import { resolveHost } from "./dns.js";
import { probeDomain } from "./http.js";
import { isPrivateIP } from "./ip.js";

export type ScanStatus = {
  scanId: string;
  total: number;
  completed: number;
  current: string[];
  internalHosts: Map<string, string[]>;
  externalHosts: Map<string, string[]>;
  failedHosts: string[];
  isComplete: boolean;
};

export type ScanResults = {
  internal: string[];
  external: string[];
  combined: string[];
  totalDomains: number;
};

type ScanState = {
  status: ScanStatus;
  onProgress: (status: ScanStatus) => void;
  onComplete: (results: ScanResults) => void;
  cancelled: boolean;
};

const activeScans = new Map<string, ScanState>();

/**
 * Start a new scan
 */
export function startScan(
  scanId: string,
  domains: string[],
  timeout: number,
  concurrency: number,
  onProgress: (status: ScanStatus) => void,
  onComplete: (results: ScanResults) => void,
): void {
  const status: ScanStatus = {
    scanId,
    total: domains.length,
    completed: 0,
    current: [],
    internalHosts: new Map(),
    externalHosts: new Map(),
    failedHosts: [],
    isComplete: false,
  };

  const state: ScanState = {
    status,
    onProgress,
    onComplete,
    cancelled: false,
  };

  activeScans.set(scanId, state);
  console.log(
    `[SURF - Scanner] Scan ${scanId} started: ${domains.length} domains, timeout=${timeout}ms, concurrency=${concurrency}`,
  );

  // Start processing domains with concurrency control
  processDomains(domains, timeout, concurrency, state).catch((error) => {
    console.error(
      `[Scanner] Scan ${scanId} error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
}

/**
 * Get current scan status
 */
export function getScanStatus(scanId: string): ScanStatus | undefined {
  const state = activeScans.get(scanId);
  if (state === undefined) {
    console.log(`[SURF - Scanner] getScanStatus: Scan ${scanId} not found`);
  }
  return state?.status;
}

/**
 * Get scan results
 */
export function getScanResults(scanId: string): ScanResults | undefined {
  const state = activeScans.get(scanId);
  if (state === undefined) {
    console.log(`[SURF - Scanner] getScanResults: Scan ${scanId} not found`);
    return undefined;
  }

  if (!state.status.isComplete) {
    console.log(
      `[SURF - Scanner] getScanResults: Scan ${scanId} not complete yet`,
    );
    return undefined;
  }

  const internal = Array.from(state.status.internalHosts.keys());
  const external = Array.from(state.status.externalHosts.keys());
  const combined = [...internal, ...external];

  console.log(
    `[SURF - Scanner] getScanResults: ${scanId} - ${internal.length} internal, ${external.length} external, ${combined.length} total`,
  );
  return { internal, external, combined, totalDomains: state.status.total };
}

/**
 * Cancel an active scan
 */
export function cancelScan(scanId: string): boolean {
  console.log(`[SURF - Scanner] cancelScan called for ${scanId}`);
  const state = activeScans.get(scanId);
  if (state === undefined) {
    console.log(`[SURF - Scanner] cancelScan: Scan ${scanId} not found`);
    return false;
  }

  if (state.cancelled) {
    console.log(
      `[SURF - Scanner] cancelScan: Scan ${scanId} already cancelled`,
    );
    return false;
  }

  console.log(
    `[SURF - Scanner] Cancelling scan ${scanId} (${state.status.completed}/${state.status.total} completed)`,
  );
  state.cancelled = true;
  state.status.isComplete = true;
  state.status.current = [];

  // Get partial results
  const results: ScanResults = {
    internal: Array.from(state.status.internalHosts.keys()),
    external: Array.from(state.status.externalHosts.keys()),
    combined: [
      ...Array.from(state.status.internalHosts.keys()),
      ...Array.from(state.status.externalHosts.keys()),
    ],
    totalDomains: state.status.total,
  };

  console.log(
    `[SURF - Scanner] ZzScan ${scanId} cancelled: ${results.internal.length} internal, ${results.external.length} external, ${results.combined.length} total (partial results)`,
  );
  state.onComplete(results);

  return true;
}

/**
 * Process domains with concurrency control
 */
async function processDomains(
  domains: string[],
  timeout: number,
  concurrency: number,
  state: ScanState,
): Promise<void> {
  console.log(
    `[SURF - Scanner] processDomains: Starting processing ${domains.length} domains for scan ${state.status.scanId}`,
  );
  const processing = new Set<string>();
  let completed = 0;

  const processDomainAsync = async (domain: string): Promise<void> => {
    if (state.cancelled) {
      console.log(
        `[SURF - Scanner] processDomainAsync: Skipping ${domain} (scan cancelled)`,
      );
      return;
    }

    console.log(
      `[SURF - Scanner] processDomainAsync: Starting ${domain} (${processing.size}/${concurrency} active)`,
    );
    processing.add(domain);
    state.status.current = Array.from(processing);
    state.onProgress({ ...state.status });

    try {
      if (!state.cancelled) {
        await processDomain(domain, timeout, state);
      } else {
        console.log(
          `[SURF - Scanner] processDomainAsync: ${domain} skipped (scan cancelled)`,
        );
      }
    } catch (error) {
      console.error(
        `[Scanner] processDomainAsync: Error processing domain ${domain}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      processing.delete(domain);
      if (!state.cancelled) {
        completed++;
        state.status.completed = completed;
        if (completed % 10 === 0 || completed === domains.length) {
          console.log(
            `[SURF - Scanner] processDomains: Progress ${completed}/${
              domains.length
            } (${Math.round((completed / domains.length) * 100)}%)`,
          );
        }
      }
      state.status.current = Array.from(processing);
      state.onProgress({ ...state.status });
    }
  };

  // Process all domains with concurrency limit
  const promises: Promise<void>[] = [];

  for (const domain of domains) {
    // Check if scan was cancelled
    if (state.cancelled) {
      console.log(
        `[SURF - Scanner] processDomains: Stopping domain queue (scan cancelled)`,
      );
      break;
    }

    // Wait if we've reached concurrency limit
    while (processing.size >= concurrency && !state.cancelled) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Don't start new domains if cancelled
    if (state.cancelled) {
      console.log(
        `[SURF - Scanner] processDomains: Stopping domain queue (scan cancelled)`,
      );
      break;
    }

    // Start processing this domain
    promises.push(processDomainAsync(domain));
  }

  console.log(
    `[SURF - Scanner] processDomains: All ${promises.length} domain tasks started, waiting for completion`,
  );
  // Wait for all to complete (or cancelled)
  await Promise.all(promises);

  // All done (or cancelled)
  if (!state.cancelled) {
    state.status.isComplete = true;
    console.log(
      `[SURF - Scanner] processDomains: Scan ${state.status.scanId} completed successfully`,
    );
  } else {
    console.log(
      `[SURF - Scanner] processDomains: Scan ${state.status.scanId} was cancelled`,
    );
  }
  state.status.current = [];

  const results: ScanResults = {
    internal: Array.from(state.status.internalHosts.keys()),
    external: Array.from(state.status.externalHosts.keys()),
    combined: [
      ...Array.from(state.status.internalHosts.keys()),
      ...Array.from(state.status.externalHosts.keys()),
    ],
    totalDomains: state.status.total,
  };

  console.log(
    `[SURF - Scanner] processDomains: Final results for ${state.status.scanId} - ${results.internal.length} internal, ${results.external.length} external, ${results.combined.length} total, ${state.status.failedHosts.length} failed`,
  );
  state.onComplete(results);
}

/**
 * Process a single domain
 */
async function processDomain(
  domain: string,
  timeout: number,
  state: ScanState,
): Promise<void> {
  console.log(`[SURF - Scanner] processDomain: Processing ${domain}`);

  // First, try to probe HTTP/HTTPS
  const probeResult = await probeDomain(domain, timeout);

  // If probe succeeded, we don't care about this domain (it's accessible)
  if (probeResult.success) {
    console.log(
      `[SURF - Scanner] processDomain: ${domain} is accessible via ${probeResult.protocol}, skipping (not a candidate)`,
    );
    return;
  }

  console.log(
    `[SURF - Scanner] processDomain: ${domain} probe failed (${probeResult.error}), resolving DNS for candidate classification`,
  );
  // Probe failed, so this is a candidate - resolve DNS
  const ips = await resolveHost(domain);

  // If DNS resolution failed, add to failed hosts
  if (ips.length === 0) {
    console.log(
      `[SURF - Scanner] processDomain: ${domain} DNS resolution failed, adding to failed hosts`,
    );
    state.status.failedHosts.push(domain);
    return;
  }

  console.log(
    `[SURF - Scanner] processDomain: ${domain} resolved to ${
      ips.length
    } IP(s): ${ips.join(", ")}`,
  );
  // Check if any IP is private
  const hasPrivateIP = ips.some((ip) => isPrivateIP(ip));

  if (hasPrivateIP) {
    // At least one IP is private - categorize as internal
    console.log(
      `[SURF - Scanner] processDomain: ${domain} classified as INTERNAL (has private IP)`,
    );
    state.status.internalHosts.set(domain, ips);
  } else {
    // All IPs are public - categorize as external
    console.log(
      `[SURF - Scanner] processDomain: ${domain} classified as EXTERNAL (all public IPs)`,
    );
    state.status.externalHosts.set(domain, ips);
  }
}
