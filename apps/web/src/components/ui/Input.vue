<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  modelValue?: string | number | null;
  type?: "text" | "password" | "email" | "number" | "tel" | "url" | "search";
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  class?: string;
  autocomplete?: string;
  min?: number;
  max?: number;
  required?: boolean;
}

const props = withDefaults(defineProps<Props>(), { type: "text" });
const emit = defineEmits<{ "update:modelValue": [value: string | number] }>();

function onInput(e: Event) {
  const target = e.target as HTMLInputElement;
  if (props.type === "number") {
    emit("update:modelValue", target.value === "" ? "" : Number(target.value));
  } else {
    emit("update:modelValue", target.value);
  }
}

const classes = computed(() =>
  cn(
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
    props.class
  )
);
</script>

<template>
  <input
    :value="modelValue ?? ''"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :autocomplete="autocomplete"
    :min="min"
    :max="max"
    :required="required"
    :class="classes"
    @input="onInput"
  />
</template>
