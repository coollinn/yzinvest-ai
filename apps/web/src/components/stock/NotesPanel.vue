<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { ref, watch, computed } from "vue";
import { Trash2 } from "lucide-vue-next";
import { useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import {
  deleteLocalNote,
  getLocalNote,
  upsertLocalNote,
} from "@/composables/useLocalStorage";
import type { Note } from "@yzinvest/shared";

const props = defineProps<{ tsCode: string }>();
const auth = useAuthStore();
const router = useRouter();
const qc = useQueryClient();

const content = ref("");
const rating = ref<number | null>(null);
const tags = ref("");
const analysisType = ref<"DCF" | "CAPM" | "Technical" | "Fundamental" | "Other">("Other");

// 本地笔记
const localNote = computed(() => getLocalNote(props.tsCode));

const { data: notes, refetch } = useQuery({
  queryKey: ["notes", () => props.tsCode],
  queryFn: () =>
    apiGet<{ items: Note[] }>(
      `/notes?ts_code=${props.tsCode}&limit=50`
    ),
  enabled: () => auth.isAuthenticated,
});

// 加载数据（API 或本地）
function loadData() {
  if (auth.isAuthenticated) {
    const n = notes.value?.items?.[0];
    if (n) {
      content.value = n.content;
      rating.value = n.rating;
      tags.value = (n.tags ?? []).join(", ");
      analysisType.value = (n.analysis_type as typeof analysisType.value) ?? "Other";
      return;
    }
  } else {
    const n = localNote.value;
    if (n) {
      content.value = n.content;
      rating.value = n.rating ?? null;
      tags.value = (n.tags ?? []).join(", ");
      analysisType.value = (n.analysis_type as typeof analysisType.value) ?? "Other";
      return;
    }
  }
  // 没有数据时重置
  content.value = "";
  rating.value = null;
  tags.value = "";
  analysisType.value = "Other";
}

watch(
  () => [notes.value?.items?.[0], localNote.value, auth.isAuthenticated],
  () => loadData(),
  { immediate: true }
);

async function save() {
  if (!auth.isAuthenticated) {
    upsertLocalNote({
      ts_code: props.tsCode,
      content: content.value,
      rating: rating.value ?? undefined,
      tags: tags.value ? tags.value.split(",").map((s) => s.trim()).filter(Boolean) : [],
      analysis_type: analysisType.value,
    });
    qc.invalidateQueries({ queryKey: ["my-notes"] });
    return;
  }
  await apiPost("/notes", {
    ts_code: props.tsCode,
    content: content.value,
    rating: rating.value ?? undefined,
    tags: tags.value ? tags.value.split(",").map((s) => s.trim()).filter(Boolean) : [],
    analysis_type: analysisType.value,
  });
  await refetch();
}

async function remove() {
  if (!auth.isAuthenticated) {
    deleteLocalNote(props.tsCode);
    content.value = "";
    rating.value = null;
    tags.value = "";
    qc.invalidateQueries({ queryKey: ["my-notes"] });
    return;
  }
  const id = notes.value?.items?.[0]?.id;
  if (id) {
    await apiDelete(`/notes/${id}`);
    content.value = "";
    rating.value = null;
    tags.value = "";
    await refetch();
  }
}

const hasNote = computed(() => {
  if (auth.isAuthenticated) return !!notes.value?.items?.[0];
  return !!localNote.value;
});
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">投研笔记</h3>
        <span v-if="!auth.isAuthenticated" class="text-xs text-muted-foreground">本地保存</span>
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="grid grid-cols-3 gap-3">
        <div class="space-y-1.5">
          <Label>分析类型</Label>
          <select
            v-model="analysisType"
            class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="DCF">DCF</option>
            <option value="CAPM">CAPM</option>
            <option value="Technical">技术面</option>
            <option value="Fundamental">基本面</option>
            <option value="Other">其它</option>
          </select>
        </div>
        <div class="space-y-1.5">
          <Label>评分 1-5</Label>
          <Input v-model.number="rating" type="number" :min="1" :max="5" />
        </div>
        <div class="space-y-1.5">
          <Label>标签（逗号分隔）</Label>
          <Input v-model="tags" placeholder="低估,蓝筹" />
        </div>
      </div>
      <div class="space-y-1.5">
        <Label>内容</Label>
        <textarea
          v-model="content"
          rows="6"
          class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="基于估值模型的投资思路、风险点、关键假设..."
        />
      </div>
      <div class="flex items-center justify-between">
        <Button @click="save">{{ hasNote ? "更新笔记" : "保存笔记" }}</Button>
        <Button
          v-if="hasNote"
          variant="ghost"
          size="sm"
          @click="remove"
        >
          <Trash2 class="h-3.5 w-3.5" /> 删除
        </Button>
      </div>
      <p v-if="!auth.isAuthenticated" class="text-xs text-muted-foreground">
        未登录，笔记仅保存在本地浏览器。<router-link to="/login" class="underline">登录</router-link>后可同步到云端。
      </p>
    </CardContent>
  </Card>
</template>
