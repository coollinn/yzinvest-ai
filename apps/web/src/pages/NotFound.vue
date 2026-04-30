<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <section class="flex flex-col items-center justify-center py-32 text-center">
    <h1 class="text-7xl font-bold tracking-tight">404</h1>
    <p class="mt-3 text-muted-foreground">页面没找到</p>
    <RouterLink
      to="/"
      class="mt-6 inline-flex items-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      回到首页
    </RouterLink>
  </section>
</template>
