<script setup lang="ts">
import { cn } from "@/lib/utils";
defineProps<{ class?: string }>();
</script>

<template>
  <hr :class="cn('shrink-0 border-t border-border', $props.class)" />
</template>
