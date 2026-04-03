export interface Student {
  id: string;
  name: string;
  nameKana: string;
  pinHash: string;
  isActive: boolean;
  joinYear: number;
  grade: string;       // '2年', '3年', '4年' etc.
  role: string;        // '監視長', 'ガード' etc.
  hasPwc: boolean;     // PWC免許保持者
  isLeader: boolean;   // 監視長 or 副監視長
  bankAccount?: string;
}

export interface SeasonDay {
  date: string; // "YYYY-MM-DD"
  cityMinimum: number;
  actualSlots: number;
  isOpen: boolean;
  note: string;
}

export type AvailabilityStatus = 'yes' | 'no' | 'am' | 'pm' | 'undecided';

export interface Availability {
  id: string;
  studentId: string;
  date: string;
  available: boolean; // 後方互換: yes/am/pm → true, no → false
  status: AvailabilityStatus; // 詳細な可否ステータス
  note: string; // 未定理由のメモ
  submittedAt: string;
}

export type PayType = '1' | 'V';
export type ShiftStatus = 'draft' | 'published' | 'attended' | 'absent' | 'cancelled';
export type AttendanceType = 'full' | 'am' | 'pm';

export interface ShiftAssignment {
  id: string;
  studentId: string;
  date: string;
  payType: PayType;
  status: ShiftStatus;
  attendance: AttendanceType; // full / am / pm
  replacedBy?: string;       // 交代先の学生ID（元のシフトに記録）
  replacesId?: string;       // 交代元のシフトID（交代で入った側に記録）
  note: string;
  createdAt: string;
}

export interface AppSettings {
  adminPasswordHash: string;
  seasonStart: string; // "YYYY-MM-DD"
  seasonEnd: string;   // "YYYY-MM-DD"
  fullPayAmount: number; // 9100
  vPayAmount: number;    // 2000
  clubName: string;
}

export interface StudentSummary {
  studentId: string;
  /** 1:V比率計算用（attended + published を含む） */
  fullPayDays: number;
  vPayDays: number;
  totalDays: number;
  fullPayRatio: number;
  /** 出勤確定分（attended のみ） */
  attendedFullPayDays: number;
  attendedVPayDays: number;
  attendedDays: number;
  absentDays: number;
  /** 給与は出勤確定分のみ */
  totalPay: number;
}
