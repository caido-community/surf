<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Checkbox from "primevue/checkbox";
import InputNumber from "primevue/inputnumber";
import ProgressBar from "primevue/progressbar";
import Textarea from "primevue/textarea";
import { onMounted, onUnmounted, ref } from "vue";

import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

// Form state
const domainsText = ref("");
const timeout = ref(3000);
const concurrency = ref(10);
const isScanning = ref(false);
const scanId = ref<string | undefined>(undefined);

// Progress state
const progress = ref(0);
const total = ref(0);
const currentDomains = ref<string[]>([]);

// Results state
const internalCount = ref(0);
const externalCount = ref(0);
const combinedCount = ref(0);
const totalDomainsScanned = ref(0);
const showResults = ref(false);
const prependProtocol = ref(true);

// File upload handler
const fileInputRef = ref<HTMLInputElement | undefined>(undefined);

const onFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file === undefined) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    domainsText.value = text;
  };
  reader.readAsText(file);
};

const triggerFileUpload = () => {
  fileInputRef.value?.click();
};

// Upload functions
const uploadInternalIPs = async () => {
  if (scanId.value === undefined) {
    sdk.window.showToast("No scan results available", { variant: "error" });
    return;
  }

  const result = await sdk.backend.uploadInternalIPsToFiles(
    scanId.value,
    prependProtocol.value,
  );

  if (result.kind === "Error") {
    sdk.window.showToast(result.error, { variant: "error" });
    return;
  }

  sdk.window.showToast(`Internal IPs uploaded to ${result.value}`, {
    variant: "success",
  });
};

const uploadExternalIPs = async () => {
  if (scanId.value === undefined) {
    sdk.window.showToast("No scan results available", { variant: "error" });
    return;
  }

  const result = await sdk.backend.uploadExternalIPsToFiles(
    scanId.value,
    prependProtocol.value,
  );

  if (result.kind === "Error") {
    sdk.window.showToast(result.error, { variant: "error" });
    return;
  }

  sdk.window.showToast(`External IPs uploaded to ${result.value}`, {
    variant: "success",
  });
};

const uploadCombinedWordlist = async () => {
  if (scanId.value === undefined) {
    sdk.window.showToast("No scan results available", { variant: "error" });
    return;
  }

  const result = await sdk.backend.uploadCombinedWordlistToFiles(
    scanId.value,
    prependProtocol.value,
  );

  if (result.kind === "Error") {
    sdk.window.showToast(result.error, { variant: "error" });
    return;
  }

  sdk.window.showToast(`Combined wordlist uploaded to ${result.value}`, {
    variant: "success",
  });
};

// Download functions
const downloadFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const downloadInternalIPs = async () => {
  if (scanId.value === undefined) {
    sdk.window.showToast("No scan results available", { variant: "error" });
    return;
  }

  const result = await sdk.backend.downloadInternalIPs(
    scanId.value,
    prependProtocol.value,
  );

  if (result.kind === "Error") {
    sdk.window.showToast(result.error, { variant: "error" });
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `surf-internal-${timestamp}.txt`;
  downloadFile(result.value, fileName);
  sdk.window.showToast("Internal IPs downloaded", { variant: "success" });
};

const downloadExternalIPs = async () => {
  if (scanId.value === undefined) {
    sdk.window.showToast("No scan results available", { variant: "error" });
    return;
  }

  const result = await sdk.backend.downloadExternalIPs(
    scanId.value,
    prependProtocol.value,
  );

  if (result.kind === "Error") {
    sdk.window.showToast(result.error, { variant: "error" });
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `surf-external-${timestamp}.txt`;
  downloadFile(result.value, fileName);
  sdk.window.showToast("External IPs downloaded", { variant: "success" });
};

const downloadCombinedWordlist = async () => {
  if (scanId.value === undefined) {
    sdk.window.showToast("No scan results available", { variant: "error" });
    return;
  }

  const result = await sdk.backend.downloadCombinedWordlist(
    scanId.value,
    prependProtocol.value,
  );

  if (result.kind === "Error") {
    sdk.window.showToast(result.error, { variant: "error" });
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `surf-combined-${timestamp}.txt`;
  downloadFile(result.value, fileName);
  sdk.window.showToast("Combined wordlist downloaded", {
    variant: "success",
  });
};

// Start scan
const startScan = async () => {
  if (isScanning.value) {
    return;
  }

  // Parse domains from text
  const domains = domainsText.value
    .split("\n")
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && d !== undefined);

  if (domains.length === 0) {
    sdk.window.showToast("Please provide at least one domain", {
      variant: "error",
    });
    return;
  }

  isScanning.value = true;
  showResults.value = false;
  progress.value = 0;
  currentDomains.value = [];
  internalCount.value = 0;
  externalCount.value = 0;
  combinedCount.value = 0;
  totalDomainsScanned.value = 0;

  const result = await sdk.backend.startScan(
    domains,
    timeout.value,
    concurrency.value,
  );

  if (result.kind === "Error") {
    sdk.window.showToast(result.error, { variant: "error" });
    isScanning.value = false;
    return;
  }

  scanId.value = result.value.scanId;
  total.value = domains.length;

  // Start polling for status
  pollStatus();
};

// Cancel scan
const cancelScan = async () => {
  if (scanId.value === undefined) {
    return;
  }

  const result = await sdk.backend.cancelScan(scanId.value);

  if (result.kind === "Error") {
    sdk.window.showToast(result.error, { variant: "error" });
    return;
  }

  // Clear polling interval
  if (statusInterval !== undefined) {
    clearInterval(statusInterval);
    statusInterval = undefined;
  }

  isScanning.value = false;
  sdk.window.showToast("Scan cancelled", { variant: "success" });
};

// Poll for scan status
let statusInterval: ReturnType<typeof setInterval> | undefined = undefined;

const pollStatus = () => {
  if (statusInterval !== undefined) {
    clearInterval(statusInterval);
  }

  statusInterval = setInterval(async () => {
    if (scanId.value === undefined) {
      return;
    }

    const statusResult = await sdk.backend.getScanStatus(scanId.value);

    if (statusResult.kind === "Error") {
      if (statusInterval !== undefined) {
        clearInterval(statusInterval);
        statusInterval = undefined;
      }
      sdk.window.showToast(statusResult.error, { variant: "error" });
      isScanning.value = false;
      return;
    }

    const status = statusResult.value;
    progress.value =
      status.total > 0 ? (status.completed / status.total) * 100 : 0;
    currentDomains.value = status.current;

    if (status.isComplete) {
      if (statusInterval !== undefined) {
        clearInterval(statusInterval);
        statusInterval = undefined;
      }
      isScanning.value = false;

      // Get final results
      const resultsResult = await sdk.backend.getScanResults(scanId.value);

      if (resultsResult.kind === "Error") {
        sdk.window.showToast(resultsResult.error, { variant: "error" });
        return;
      }

      const results = resultsResult.value;
      internalCount.value = results.internalCount;
      externalCount.value = results.externalCount;
      combinedCount.value = results.combinedCount;
      totalDomainsScanned.value = results.totalDomains;
      showResults.value = true;
    }
  }, 500);
};

// Listen for backend events
onMounted(() => {
  sdk.backend.onEvent("scan-progress", (...args: unknown[]) => {
    const data = args[0] as {
      scanId: string;
      current: number;
      total: number;
      currentDomains: string[];
    };
    if (data.scanId === scanId.value) {
      progress.value = data.total > 0 ? (data.current / data.total) * 100 : 0;
      currentDomains.value = data.currentDomains;
    }
  });

  sdk.backend.onEvent("scan-complete", (...args: unknown[]) => {
    const data = args[0] as {
      scanId: string;
      results: {
        internalCount: number;
        externalCount: number;
        combinedCount: number;
        totalDomains: number;
      };
    };
    if (data.scanId === scanId.value) {
      isScanning.value = false;
      if (statusInterval !== undefined) {
        clearInterval(statusInterval);
        statusInterval = undefined;
      }

      internalCount.value = data.results.internalCount;
      externalCount.value = data.results.externalCount;
      combinedCount.value = data.results.combinedCount;
      totalDomainsScanned.value = data.results.totalDomains;
      showResults.value = true;
    }
  });
});

onUnmounted(() => {
  if (statusInterval !== undefined) {
    clearInterval(statusInterval);
  }
});
</script>

<template>
  <div
    class="h-full w-full p-1"
    style="background-color: #26272c"
  >
    <div class="space-y-3">
      <!-- Header -->
      <Card>
        <template #content>
          <h1 class="text-2xl font-bold mb-2">Surf for Caido</h1>
          <p class="text-sm text-muted-foreground">
            Probe domains for candidates for SSRF testing. The tool is inspired by <a href="https://github.com/assetnote/surf" target="_blank" class="underline hover:text-blue-400">SLCyber's Surf</a>.
          </p>
        </template>
      </Card>

      <!-- Configuration Card -->
      <Card>
        <template #title>Configuration</template>
        <template #content>
          <div class="space-y-4">
            <!-- Domain Input -->
            <div>
              <label class="block text-sm font-medium mb-2"
                >Domains (one per line)</label
              >
              <div class="flex gap-2 mb-2 items-center">
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".txt"
                  class="hidden"
                  @change="onFileUpload"
                />
                <Button
                  label="Upload File"
                  icon="fa fa-upload"
                  :disabled="isScanning"
                  size="small"
                  @click="triggerFileUpload"
                />
                <span class="text-xs text-muted-foreground">
                  Or paste domains below
                </span>
              </div>
              <Textarea
                v-model="domainsText"
                :disabled="isScanning"
                rows="8"
                placeholder="example.com&#10;subdomain.example.com&#10;192.168.1.1"
                class="w-full font-mono text-sm"
              />
            </div>

            <!-- Settings -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-2"
                  >Timeout (milliseconds)</label
                >
                <InputNumber
                  v-model="timeout"
                  :disabled="isScanning"
                  :min="100"
                  :max="60000"
                  class="w-full"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-2"
                  >Concurrency</label
                >
                <InputNumber
                  v-model="concurrency"
                  :disabled="isScanning"
                  :min="1"
                  :max="500"
                  class="w-full"
                />
              </div>
            </div>

            <!-- Start Button -->
            <div>
              <Button
                label="Start Scan"
                :disabled="isScanning || domainsText.trim().length === 0"
                class="w-full"
                @click="startScan"
              />
            </div>
          </div>
        </template>
      </Card>

      <!-- Progress Card -->
      <Card v-if="isScanning || showResults">
        <template #title>Progress</template>
        <template #content>
          <div class="space-y-4">
            <div class="flex justify-end mb-2">
              <Button
                v-if="isScanning"
                label="Cancel Scan"
                icon="fa fa-times"
                severity="danger"
                size="small"
                @click="cancelScan"
              />
            </div>
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span>Scanning domains...</span>
                <span>{{ Math.round(progress) }}%</span>
              </div>
              <ProgressBar :value="progress" />
            </div>

            <!-- Current Domains -->
            <div v-if="currentDomains.length > 0">
              <p class="text-sm font-medium mb-2">Currently processing:</p>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="domain in currentDomains"
                  :key="domain"
                  class="px-2 py-1 bg-primary/10 text-primary text-xs rounded"
                >
                  {{ domain }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </Card>

      <!-- Results Card -->
      <Card v-if="showResults">
        <template #title>Results</template>
        <template #content>
          <div class="space-y-6">
            <!-- Summary -->
            <div class="grid grid-cols-4 gap-4">
              <div class="p-4 bg-muted rounded">
                <div class="text-2xl font-bold">{{ totalDomainsScanned }}</div>
                <div class="text-sm text-muted-foreground">Total Domains Scanned</div>
              </div>
              <div class="p-4 bg-muted rounded">
                <div class="text-2xl font-bold">{{ internalCount }}</div>
                <div class="text-sm text-muted-foreground">Internal IPs</div>
              </div>
              <div class="p-4 bg-muted rounded">
                <div class="text-2xl font-bold">{{ externalCount }}</div>
                <div class="text-sm text-muted-foreground">
                  External IPs without http(s) access
                </div>
              </div>
              <div class="p-4 bg-muted rounded">
                <div class="text-2xl font-bold">{{ combinedCount }}</div>
                <div class="text-sm text-muted-foreground">
                  Total Candidates
                </div>
              </div>
            </div>

            <!-- Prepend Protocol Checkbox -->
            <div class="flex items-center gap-2">
              <Checkbox
                v-model="prependProtocol"
                inputId="prependProtocol"
                :binary="true"
              />
              <label for="prependProtocol" class="text-sm cursor-pointer">
                Prepend protocol to wordlist
              </label>
            </div>

            <!-- Upload/Download Buttons -->
            <div class="flex flex-row gap-3 items-center">
              <!-- Internal IPs Group -->
              <div class="flex flex-row gap-3 items-center">
                <Button
                  label="Upload Internal IPs to Files"
                  icon="fas fa-upload"
                  :disabled="internalCount === 0"
                  class="flex-1"
                  @click="uploadInternalIPs"
                />
                <Button
                  label="Download"
                  icon="fas fa-download"
                  :disabled="internalCount === 0"
                  severity="secondary"
                  style="color: #26272c"
                  @click="downloadInternalIPs"
                />
              </div>

              <!-- Vertical Separator -->
              <div class="border-l border-gray-600 h-10"></div>

              <!-- External IPs Group -->
              <div class="flex flex-row gap-3 items-center">
                <Button
                  label="Upload External IPs to Files"
                  icon="fas fa-upload"
                  :disabled="externalCount === 0"
                  class="flex-1"
                  @click="uploadExternalIPs"
                />
                <Button
                  label="Download"
                  icon="fas fa-download"
                  :disabled="externalCount === 0"
                  severity="secondary"
                  style="color: #26272c"
                  @click="downloadExternalIPs"
                />
              </div>

              <!-- Vertical Separator -->
              <div class="border-l border-gray-600 h-10"></div>

              <!-- Combined Wordlist Group -->
              <div class="flex flex-row gap-3 items-center">
                <Button
                  label="Upload Combined Wordlist to Files"
                  icon="fas fa-upload"
                  :disabled="combinedCount === 0"
                  class="flex-1"
                  @click="uploadCombinedWordlist"
                />
                <Button
                  label="Download"
                  icon="fas fa-download"
                  :disabled="combinedCount === 0"
                  severity="secondary"
                  style="color: #26272c"
                  @click="downloadCombinedWordlist"
                />
              </div>
            </div>

          </div>
        </template>
      </Card>
    </div>
  </div>
</template>
