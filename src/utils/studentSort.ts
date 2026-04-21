import type { Student } from '@/types';

/**
 * 学生一覧の表示順:
 *   監視長 → 副監視長 → 3年 → 4年 → 2年 → 1年 → その他
 * 同じ優先度内は nameKana (なければ name) で五十音順。
 * 学生管理画面とログイン画面の名前選択で共通して使う。
 */
function studentPriority(s: Pick<Student, 'role' | 'grade'>): number {
  if (s.role === '監視長') return 0;
  if (s.role === '副監視長') return 1;
  switch (s.grade) {
    case '3年': return 2;
    case '4年': return 3;
    case '2年': return 4;
    case '1年': return 5;
    default: return 6;
  }
}

export function sortStudents<T extends Pick<Student, 'name' | 'nameKana' | 'grade' | 'role'>>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const pa = studentPriority(a);
    const pb = studentPriority(b);
    if (pa !== pb) return pa - pb;
    return (a.nameKana || a.name).localeCompare(b.nameKana || b.name, 'ja');
  });
}

export const GRADE_OPTIONS = ['1年', '2年', '3年', '4年', 'その他'];
