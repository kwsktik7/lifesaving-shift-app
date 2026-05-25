import type { Student } from '@/types';

/**
 * 学生一覧の表示順:
 *   1. `order` フィールドが設定されている学生 (PDF#1〜#53 の名簿順を維持) を昇順
 *   2. `order` 未設定の学生は次に: 監視長 → 副監視長 → 3年 → 4年 → 2年 → 1年 → その他
 * 同じ優先度内は nameKana (なければ name) で五十音順。
 * シフト表・勤怠表・学生選択など全画面で共通して使う。
 */
function studentFallbackPriority(s: Pick<Student, 'role' | 'grade'>): number {
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

export function sortStudents<T extends Pick<Student, 'name' | 'nameKana' | 'grade' | 'role' | 'order'>>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const ao = a.order;
    const bo = b.order;
    // order あり同士: 数値の昇順
    if (ao !== undefined && bo !== undefined) {
      if (ao !== bo) return ao - bo;
    } else if (ao !== undefined) {
      return -1; // a だけ order あり → a が先
    } else if (bo !== undefined) {
      return 1;  // b だけ order あり → b が先
    } else {
      // 両方 order なし: 既存のフォールバック順
      const pa = studentFallbackPriority(a);
      const pb = studentFallbackPriority(b);
      if (pa !== pb) return pa - pb;
    }
    return (a.nameKana || a.name).localeCompare(b.nameKana || b.name, 'ja');
  });
}

export const GRADE_OPTIONS = ['1年', '2年', '3年', '4年', 'その他'];
