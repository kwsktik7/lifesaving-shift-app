/**
 * localStorage → Firestore データ移行
 * 初回ロード時、Firestoreが空でlocalStorageにデータがある場合に実行
 */
import { collection, getDocs, writeBatch, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

interface ZustandPersistFormat<T> {
  state: T;
  version: number;
}

function loadFromLocalStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: ZustandPersistFormat<T> = JSON.parse(raw);
    return parsed?.state ?? null;
  } catch {
    return null;
  }
}

export async function migrateLocalStorageToFirestore(): Promise<boolean> {
  if (!db) return false;

  // Firestoreにデータがあれば移行不要
  const settingsSnap = await getDocs(collection(db, 'settings'));
  if (!settingsSnap.empty) {
    console.log('[migrate] Firestore already has data, skipping migration');
    return false;
  }

  // localStorageにデータがあるかチェック
  const hasLocalData = localStorage.getItem('zushi_settings') || localStorage.getItem('zushi_students');
  if (!hasLocalData) {
    console.log('[migrate] No localStorage data to migrate');
    return false;
  }

  console.log('[migrate] Starting localStorage → Firestore migration...');

  // 1. Settings
  const settings = loadFromLocalStorage<{ settings: Record<string, unknown> }>('zushi_settings');
  if (settings?.settings) {
    await setDoc(doc(db, 'settings', 'main'), settings.settings);
    console.log('[migrate] Settings migrated');
  }

  // 2. Season Days
  const season = loadFromLocalStorage<{ days: { date: string; [k: string]: unknown }[] }>('zushi_season_days');
  if (season?.days?.length) {
    // Firestore batch max is 500, split if needed
    for (let i = 0; i < season.days.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = season.days.slice(i, i + 500);
      for (const day of chunk) {
        const { date, ...rest } = day;
        batch.set(doc(db, 'seasonDays', date), rest);
      }
      await batch.commit();
    }
    console.log(`[migrate] ${season.days.length} season days migrated`);
  }

  // 3. Students
  const students = loadFromLocalStorage<{ students: { id: string; [k: string]: unknown }[] }>('zushi_students');
  if (students?.students?.length) {
    for (let i = 0; i < students.students.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = students.students.slice(i, i + 500);
      for (const student of chunk) {
        const { id, ...rest } = student;
        batch.set(doc(db, 'students', id), rest);
      }
      await batch.commit();
    }
    console.log(`[migrate] ${students.students.length} students migrated`);
  }

  // 4. Availability
  const avail = loadFromLocalStorage<{ availabilities: { id: string; [k: string]: unknown }[] }>('zushi_availability');
  if (avail?.availabilities?.length) {
    for (let i = 0; i < avail.availabilities.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = avail.availabilities.slice(i, i + 500);
      for (const a of chunk) {
        const { id, ...rest } = a;
        batch.set(doc(db, 'availability', id), rest);
      }
      await batch.commit();
    }
    console.log(`[migrate] ${avail.availabilities.length} availability records migrated`);
  }

  // 5. Shifts
  const shifts = loadFromLocalStorage<{ shifts: { id: string; [k: string]: unknown }[] }>('zushi_shifts');
  if (shifts?.shifts?.length) {
    for (let i = 0; i < shifts.shifts.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = shifts.shifts.slice(i, i + 500);
      for (const s of chunk) {
        const { id, ...rest } = s;
        batch.set(doc(db, 'shifts', id), rest);
      }
      await batch.commit();
    }
    console.log(`[migrate] ${shifts.shifts.length} shifts migrated`);
  }

  console.log('[migrate] Migration complete!');
  return true;
}
