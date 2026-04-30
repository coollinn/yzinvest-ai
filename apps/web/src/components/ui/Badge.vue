<script setup lang="ts">
import { cn } from "@/lib/utils";
import { computed } from "vue";

interface Props {
  variant?: "default" | "secondary" | "outline" | "destructive" | "up" | "down";
  class?: string;
}
const props = withDefaults(defineProps<Props>(), { variant: "default" });

const cls = computed(() => {
  const variants: Record<NonNullable<Props["variant"]>, string> = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-foreground",
    outline: "border border-border text-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    up: "bg-up/10 text-up",
    down: "bg-down/10 text-down",
  };
  return cn(
    "inline-flex items-center rounded-md border-transparent px-2 py-0.5 text-xs font-medium",
    variants[props.variant],
    props.class
  );
});
</script>

<template>
  <span :class="cls"><slot /></span>
</template>
