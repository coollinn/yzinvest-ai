<template>
  <div class="stock-notes">
    <a-card title="投资笔记" class="notes-card">
      <template #extra>
        <a-button type="primary" @click="showNoteModal = true" v-if="authStore.isAuthenticated">
          <template #icon>
            <PlusOutlined />
          </template>
          添加笔记
        </a-button>
      </template>

      <a-spin :spinning="loading">
        <div v-if="notes.length > 0">
          <div v-for="note in notes" :key="note.id" class="note-item">
            <div class="note-header">
              <div class="note-meta">
                <span class="note-type">{{ getAnalysisTypeText(note.analysis_type) }}</span>
                <a-rate :value="note.rating" disabled />
                <span class="note-date">{{ formatDate(note.created_at) }}</span>
              </div>
              <a-space v-if="authStore.isAuthenticated">
                <a-button type="link" size="small" @click="editNote(note)">
                  <EditOutlined />
                </a-button>
                <a-button type="link" size="small" danger @click="deleteNote(note.id)">
                  <DeleteOutlined />
                </a-button>
              </a-space>
            </div>
            <div class="note-content">
              {{ note.content }}
            </div>
          </div>
        </div>
        <div v-else class="no-notes">
          <p>暂无投资笔记</p>
          <a-button type="primary" @click="showNoteModal = true" v-if="authStore.isAuthenticated">
            添加第一条笔记
          </a-button>
        </div>
      </a-spin>
    </a-card>

    <!-- Add/Edit Note Modal -->
    <a-modal
      v-model:visible="showNoteModal"
      :title="editingNote ? '编辑笔记' : '添加笔记'"
      @ok="handleSaveNote"
      @cancel="handleCancelNote"
    >
      <a-form :model="noteForm" layout="vertical">
        <a-form-item label="分析类型">
          <a-select v-model:value="noteForm.analysis_type" placeholder="请选择分析类型">
            <a-select-option value="DCF">DCF估值</a-select-option>
            <a-select-option value="CAPM">CAPM模型</a-select-option>
            <a-select-option value="Technical">技术分析</a-select-option>
            <a-select-option value="Fundamental">基本面分析</a-select-option>
            <a-select-option value="Other">其他</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="评级">
          <a-rate v-model:value="noteForm.rating" />
        </a-form-item>
        <a-form-item label="笔记内容">
          <a-textarea
            v-model:value="noteForm.content"
            placeholder="请输入您的分析笔记..."
            :rows="6"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { useAuthStore } from '../../stores/auth'
import { notesAPI } from '../../services/api'

interface Props {
  stock: any
}

defineProps<Props>()

const authStore = useAuthStore()

const loading = ref(false)
const notes = ref<any[]>([])
const showNoteModal = ref(false)
const editingNote = ref<any>(null)

const noteForm = reactive({
  analysis_type: 'Fundamental',
  rating: 3,
  content: ''
})

// Methods
const getAnalysisTypeText = (type: string) => {
  const typeMap: { [key: string]: string } = {
    'DCF': 'DCF估值',
    'CAPM': 'CAPM模型',
    'Technical': '技术分析',
    'Fundamental': '基本面分析',
    'Other': '其他分析'
  }
  return typeMap[type] || '分析笔记'
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('zh-CN')
}

const loadNotes = async () => {
  if (!authStore.isAuthenticated) return

  try {
    loading.value = true
    const response = await notesAPI.getNotes()
    notes.value = response.data.notes || []
  } catch (error) {
    console.error('Failed to load notes:', error)
  } finally {
    loading.value = false
  }
}

const editNote = (note: any) => {
  editingNote.value = note
  Object.assign(noteForm, {
    analysis_type: note.analysis_type,
    rating: note.rating,
    content: note.content
  })
  showNoteModal.value = true
}

const deleteNote = async (noteId: number) => {
  try {
    await notesAPI.deleteNote(noteId)
    await loadNotes()
  } catch (error) {
    console.error('Failed to delete note:', error)
  }
}

const handleSaveNote = async () => {
  try {
    if (editingNote.value) {
      await notesAPI.updateNote(editingNote.value.id, noteForm)
    } else {
      await notesAPI.createNote({
        ...noteForm,
        stock_id: props.stock.id
      })
    }
    showNoteModal.value = false
    resetNoteForm()
    await loadNotes()
  } catch (error) {
    console.error('Failed to save note:', error)
  }
}

const handleCancelNote = () => {
  showNoteModal.value = false
  resetNoteForm()
}

const resetNoteForm = () => {
  editingNote.value = null
  Object.assign(noteForm, {
    analysis_type: 'Fundamental',
    rating: 3,
    content: ''
  })
}

onMounted(() => {
  loadNotes()
})
</script>

<style scoped>
.stock-notes {
  padding: 16px 0;
}

.notes-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.note-item {
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.note-item:last-child {
  border-bottom: none;
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.note-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.note-type {
  padding: 2px 8px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 4px;
  font-size: 0.8em;
  color: #1890ff;
}

.note-date {
  color: #999;
  font-size: 0.9em;
}

.note-content {
  line-height: 1.6;
  color: #333;
}

.no-notes {
  text-align: center;
  padding: 40px 0;
  color: #999;
}
</style>