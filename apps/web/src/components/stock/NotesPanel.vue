<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { ref, watch } from "vue";
import { Trash2 } from "lucide-vue-next";
import { useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import { apiDelete, apiGet, apiPost, ApiException } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { Note } from "@yzinvest/shared";

const props = defineProps<{ tsCode: string }>();
const auth = useAuthStore();
const router = useRouter();
const qc = useQueryClient();

const content = ref("");
const rating = ref<number | null>(null);
const tags = ref("");
const analysisType = ref<"DCF" | "CAPM" | "Technical" | "Fundamental" | "Other">("Other");

const { data: notes, refetch } = useQuery({
  queryKey: ["notes", () => props.tsCode],
  queryFn: () =>
    apiGet<{ items: Note[] }>(
      `/notes?ts_code=${props.tsCode}&limit=50`
    ),
  enabled: () => auth.isAuthenticated,
});

watch(
  () => notes.value?.items?.[0],
  (n) => {
    if (n) {
      content.value = n.content;
      rating.value = n.rating;
      tags.value = (n.tags ?? []).join(", ");
      analysisType.value = (n.analysis_type as typeof analysisType.value) ?? "Other";
    }
  }
);

async function save() {
  if (!auth.isAuthenticated) {
    router.push({ name: "login", query: { redirect: router.currentRoute.value.fullPath } });
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

async function remove(id: number) {
  await apiDelete(`/notes/${id}`);
  content.value = "";
  rating.value = null;
  tags.value = "";
  await refetch();
}
</script>

<template>
  <Card v-if="!auth.isAuthenticated">
    <CardContent class="py-12 text-center text-sm text-muted-foreground">
      请<router-link to="/login" class="font-medium text-foreground underline-offset-4 hover:underline">登录</router-link>后查看和编辑笔记
    </CardContent>
  </Card>
  <Card v-else>
    <CardHeader>
      <h3 class="text-lg font-semibold">投研笔记</h3>
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
        <Button @click="save">保存笔记</Button>
        <Button
          v-if="notes?.items?.[0]"
          variant="ghost"
          size="sm"
          @click="remove(notes.items[0].id)"
        >
          <Trash2 class="h-3.5 w-3.5" /> 删除
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
