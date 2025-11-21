<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Dropdown from "primevue/dropdown";
import InputText from "primevue/inputtext";
import MultiSelect from "primevue/multiselect";
import { onMounted, ref, computed } from "vue";

import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

const API_KEY = "YO THIS IS NOT A SECRET DO NOT REPORT THIS | slcyber-loves-caido-69e167e064d4d8b347cea3a7449d8fcf".slice(45);
const API_BASE = "https://tools.slcyber.io";

// Types
type Wordlist = {
  id: string;
  url: string;
  category: string;
  filename: string;
  file_size: number;
  line_count: number;
  date_created: string;
  extensions: string[];
  technologies: string[];
  created_at: string;
  updated_at: string;
};

type Metadata = {
  categories: string[];
  extensions: string[];
  technologies: string[];
};

type WordlistsResponse = {
  wordlists: Wordlist[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

// State
const selectedCategory = ref("automated");
const searchQuery = ref("");
const selectedExtensions = ref<string[]>([]);
const itemsPerPage = ref(5);
const currentPage = ref(1);
const wordlists = ref<Wordlist[]>([]);
const totalWordlists = ref(0);
const totalPages = ref(0);
const loading = ref(false);
const selectedWordlists = ref<Wordlist[]>([]);
const metadata = ref<Metadata>({
  categories: [],
  extensions: [],
  technologies: [],
});

// Category display names
const categoryNames: Record<string, string> = {
  automated: "Automatically Generated Wordlists",
  kiterunner: "Kiterunner Wordlists",
  manual: "Manually Generated Wordlists",
  technologies: "Technology ↔ Host Mappings",
};

// Computed
const filteredExtensions = computed(() => {
  return metadata.value.extensions.filter((ext) => {
    if (selectedCategory.value === "technologies") {
      return false;
    }
    return true;
  });
});

const categoryDisplayName = computed(() => {
  return categoryNames[selectedCategory.value] ?? selectedCategory.value;
});

// API Functions
const fetchMetadata = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/tools/wordlists/metadata`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }

    const data = (await response.json()) as Metadata;
    metadata.value = data;
  } catch (error) {
    sdk.window.showToast(
      `Failed to fetch metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
      { variant: "error" },
    );
  }
};

const fetchWordlists = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      category: selectedCategory.value,
      page: currentPage.value.toString(),
      page_size: itemsPerPage.value.toString(),
    });

    if (searchQuery.value !== undefined && searchQuery.value.length > 0) {
      params.append("search", searchQuery.value);
    }

    const response = await fetch(
      `${API_BASE}/api/tools/wordlists?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch wordlists: ${response.statusText}`);
    }

    const data = (await response.json()) as WordlistsResponse;
    wordlists.value = data.wordlists;
    totalWordlists.value = data.total;
    totalPages.value = data.total_pages;
    currentPage.value = data.page;
  } catch (error) {
    sdk.window.showToast(
      `Failed to fetch wordlists: ${error instanceof Error ? error.message : "Unknown error"}`,
      { variant: "error" },
    );
  } finally {
    loading.value = false;
  }
};

// Upload wordlist to Caido via backend proxy
const uploadWordlistToCaido = async (wordlist: Wordlist) => {
  try {
    sdk.window.showToast(`Downloading ${wordlist.filename}...`, {
      variant: "info",
    });

    // Call backend API to download and upload the wordlist
    const result = await sdk.backend.uploadWordlistFromUrl(
      wordlist.url,
      wordlist.filename,
    );

    if (result.kind === "Error") {
      sdk.window.showToast(result.error, { variant: "error" });
      return;
    }

    sdk.window.showToast(`Uploaded ${wordlist.filename} to Caido`, {
      variant: "success",
    });
  } catch (error) {
    sdk.window.showToast(
      `Failed to upload wordlist: ${error instanceof Error ? error.message : "Unknown error"}`,
      { variant: "error" },
    );
  }
};

// Upload selected wordlists to Caido
const uploadSelectedWordlists = async () => {
  if (selectedWordlists.value.length === 0) {
    sdk.window.showToast("Please select at least one wordlist", {
      variant: "warning",
    });
    return;
  }

  for (const wordlist of selectedWordlists.value) {
    await uploadWordlistToCaido(wordlist);
    // Small delay between uploads to avoid overwhelming
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Clear selection after upload
  selectedWordlists.value = [];
};

// Format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Format date
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

// Format number with commas
const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

// Handlers
const onCategoryChange = () => {
  currentPage.value = 1;
  selectedExtensions.value = [];
  selectedWordlists.value = [];
  fetchWordlists();
};

const onSearch = () => {
  currentPage.value = 1;
  fetchWordlists();
};

// Filter wordlists client-side (for extensions filter only, search is server-side)
const filteredWordlists = computed(() => {
  let filtered = wordlists.value;

  if (selectedExtensions.value.length > 0) {
    filtered = filtered.filter((w) =>
      selectedExtensions.value.some((ext) => w.extensions.includes(ext)),
    );
  }

  return filtered;
});

// Lifecycle
onMounted(() => {
  fetchMetadata();
  fetchWordlists();
});
</script>

<template>
  <div
    class="h-full w-full p-1"
    style="background-color: #26272c; color: #ffffff"
  >
    <div class="space-y-3">
      <!-- Header -->
      <Card>
        <template #content>
          <h1 class="text-2xl font-bold mb-2">Wordlists</h1>
          <p class="text-sm text-muted-foreground">
            Download curated wordlists for security testing and reconnaissance. This is pulled from SLCyber's wordlists API found at <a href="https://tools.slcyber.io/" target="_blank" class="underline hover:text-blue-400">https://tools.slcyber.io/</a>.
          </p>
          <div class="flex gap-4 items-center text-sm mt-2">
            <span class="px-3 py-1 bg-orange-500/20 text-orange-400 rounded">
              Free downloads
            </span>
          </div>
        </template>
      </Card>

      <!-- Category Selection -->
      <Card>
        <template #content>
          <div class="space-y-3">
            <h2 class="text-lg font-semibold mb-2">Select Category</h2>
            <p class="text-sm text-gray-400 mb-4">
              Choose a wordlist category to explore.
            </p>
            <div class="flex gap-3 flex-wrap">
              <Button
                v-for="category in metadata.categories"
                :key="category"
                :label="categoryNames[category] ?? category"
                :severity="selectedCategory === category ? undefined : 'secondary'"
                :outlined="selectedCategory !== category"
                @click="
                  selectedCategory = category;
                  onCategoryChange();
                "
              />
            </div>
          </div>
        </template>
      </Card>

      <!-- Filters -->
      <Card>
        <template #content>
          <div class="space-y-4">
            <div class="flex gap-4 items-end">
              <!-- Search -->
              <div class="flex-1">
                <label class="block text-sm font-medium mb-2">Search</label>
                <span class="p-input-icon-left w-full">
                  <InputText
                    v-model="searchQuery"
                    placeholder="Search wordlists..."
                    class="w-full"
                    @keyup.enter="onSearch"
                  />
                </span>
              </div>

              <!-- Extensions Filter -->
              <div class="flex-1">
                <label class="block text-sm font-medium mb-2">Extensions</label>
                <MultiSelect
                  v-model="selectedExtensions"
                  :options="filteredExtensions"
                  placeholder="Add extension filter"
                  class="w-full"
                  :disabled="selectedCategory === 'technologies'"
                />
              </div>

              <!-- Items Per Page -->
              <div class="w-48">
                <label class="block text-sm font-medium mb-2"
                  >Items per page</label
                >
                <Dropdown
                  v-model="itemsPerPage"
                  :options="[5, 10, 25, 50, 100]"
                  class="w-full"
                  @change="fetchWordlists"
                />
              </div>
            </div>

            <!-- Upload Selected Button -->
            <div class="mt-4">
              <Button
                label="Upload Selected Wordlists to Caido"
                icon="fas fa-upload"
                :disabled="selectedWordlists.length === 0"
                @click="uploadSelectedWordlists"
              />
            </div>
          </div>
        </template>
      </Card>

      <!-- Wordlists Table -->
      <Card>
        <template #content>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">{{ categoryDisplayName }}</h2>
              <span class="text-sm text-gray-400"
                >{{
                  selectedExtensions.length > 0
                    ? filteredWordlists.length
                    : totalWordlists
                }}
                wordlists found</span
              >
            </div>

            <DataTable
              :value="filteredWordlists"
              :loading="loading"
              :paginator="false"
              striped-rows
              selection-mode="checkbox"
              v-model:selection="selectedWordlists"
              data-key="id"
            >
              <Column selection-mode="multiple" header-style="width: 3rem" />
              <Column field="filename" header="Filename">
                <template #body="{ data }">
                  <span class="font-mono text-sm">{{ data.filename }}</span>
                </template>
              </Column>
              <Column field="file_size" header="Size">
                <template #body="{ data }">
                  {{ formatFileSize(data.file_size) }}
                </template>
              </Column>
              <Column field="line_count" header="Lines">
                <template #body="{ data }">
                  {{ formatNumber(data.line_count) }}
                </template>
              </Column>
              <Column field="date_created" header="Date">
                <template #body="{ data }">
                  {{ formatDate(data.date_created) }}
                </template>
              </Column>
              <Column field="extensions" header="Extensions">
                <template #body="{ data }">
                  <div
                    v-if="data.extensions.length > 0"
                    class="flex gap-2 flex-wrap"
                  >
                    <span
                      v-for="ext in data.extensions"
                      :key="ext"
                      class="px-2 py-1 bg-surface-700 text-xs rounded"
                    >
                      {{ ext }}
                    </span>
                  </div>
                  <span v-else class="text-gray-500">—</span>
                </template>
              </Column>
              <Column header="Actions">
                <template #body="{ data }">
                  <Button
                    label="Upload to Caido"
                    icon="fas fa-upload"
                    size="small"
                    @click="uploadWordlistToCaido(data)"
                  />
                </template>
              </Column>
            </DataTable>

            <!-- Pagination Controls -->
            <div
              v-if="totalPages > 1 && selectedExtensions.length === 0"
              class="flex items-center justify-between mt-4"
            >
              <div class="text-sm text-gray-400">
                Showing {{ (currentPage - 1) * itemsPerPage + 1 }} to
                {{ Math.min(currentPage * itemsPerPage, totalWordlists) }} of
                {{ totalWordlists }} wordlists
              </div>
              <div class="flex gap-2">
                <Button
                  label="Previous"
                  icon="fas fa-chevron-left"
                  size="small"
                  :disabled="currentPage === 1"
                  @click="
                    currentPage--;
                    fetchWordlists();
                  "
                />
                <span class="px-3 py-1 text-sm">
                  Page {{ currentPage }} of {{ totalPages }}
                </span>
                <Button
                  label="Next"
                  icon="fas fa-chevron-right"
                  icon-pos="right"
                  size="small"
                  :disabled="currentPage === totalPages"
                  @click="
                    currentPage++;
                    fetchWordlists();
                  "
                />
              </div>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>
