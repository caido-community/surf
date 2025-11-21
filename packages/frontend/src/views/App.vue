<script setup lang="ts">
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";

import Surf from "./Surf.vue";
import Wordlists from "./Wordlists.vue";
</script>

<template>
  <div class="h-full w-full" style="background-color: #26272c">
    <TabView class="h-full">
      <TabPanel header="Surf">
        <div class="h-full overflow-auto">
          <Surf />
        </div>
      </TabPanel>
      <TabPanel header="Wordlists">
        <div class="h-full overflow-auto">
          <Wordlists />
        </div>
      </TabPanel>
    </TabView>
  </div>
</template>
