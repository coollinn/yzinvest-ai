import { ref, watch, type Ref } from "vue";

export interface LocalFavorite {
  ts_code: string;
  added_at: string;
}

export interface LocalNote {
  ts_code: string;
  content: string;
  analysis_type?: string;
  rating?: number;
  tags?: string[];
  updated_at: string;
}

const FAV_KEY = "yzinvest:favorites";
const NOTE_KEY = "yzinvest:notes";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function useLocalFavorites(): Ref<LocalFavorite[]> {
  const list = ref<LocalFavorite[]>(read(FAV_KEY, []));
  watch(
    list,
    (v) => write(FAV_KEY, v),
    { deep: true }
  );
  return list;
}

export function useLocalNotes(): Ref<LocalNote[]> {
  const list = ref<LocalNote[]>(read(NOTE_KEY, []));
  watch(
    list,
    (v) => write(NOTE_KEY, v),
    { deep: true }
  );
  return list;
}

export function addLocalFavorite(ts_code: string) {
  const list = read<LocalFavorite[]>(FAV_KEY, []);
  if (list.some((f) => f.ts_code === ts_code)) return;
  list.push({ ts_code, added_at: new Date().toISOString() });
  write(FAV_KEY, list);
}

export function removeLocalFavorite(ts_code: string) {
  const list = read<LocalFavorite[]>(FAV_KEY, []);
  const filtered = list.filter((f) => f.ts_code !== ts_code);
  write(FAV_KEY, filtered);
}

export function isLocalFavorite(ts_code: string): boolean {
  const list = read<LocalFavorite[]>(FAV_KEY, []);
  return list.some((f) => f.ts_code === ts_code);
}

export function upsertLocalNote(note: Omit<LocalNote, "updated_at">) {
  const list = read<LocalNote[]>(NOTE_KEY, []);
  const idx = list.findIndex((n) => n.ts_code === note.ts_code);
  const entry: LocalNote = { ...note, updated_at: new Date().toISOString() };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  write(NOTE_KEY, list);
}

export function getLocalNote(ts_code: string): LocalNote | undefined {
  const list = read<LocalNote[]>(NOTE_KEY, []);
  return list.find((n) => n.ts_code === ts_code);
}

export function deleteLocalNote(ts_code: string) {
  const list = read<LocalNote[]>(NOTE_KEY, []);
  write(
    NOTE_KEY,
    list.filter((n) => n.ts_code !== ts_code)
  );
}

export function getAllLocalNotes(): LocalNote[] {
  return read<LocalNote[]>(NOTE_KEY, []);
}

export function getLocalFavoriteTsCodes(): string[] {
  return read<LocalFavorite[]>(FAV_KEY, []).map((f) => f.ts_code);
}

export function clearLocalFavorites() {
  localStorage.removeItem(FAV_KEY);
}

export function clearLocalNotes() {
  localStorage.removeItem(NOTE_KEY);
}
