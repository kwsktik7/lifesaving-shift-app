/**
 * 開発・負荷テスト用: 逗子SLSC 2026シーズン名簿のダミー投入スクリプト。
 * 本番データを全削除してから 68人 + seasonDays + 各人のavailabilityを書き込む。
 * 名簿は 20260404逗子名簿公開用.pdf の #1-68 を元に手入力。
 * 誕生日(PIN)は全員 "0101" 固定。
 *
 * 使い終わったら次コミットでこのファイルとAdminSettingsの呼び出しごと削除。
 */
import { db } from '@/lib/firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { hashPin } from '@/utils/auth';
import { eachDayOfInterval, format, parseISO } from 'date-fns';

interface RosterEntry {
  name: string;
  grade: string;
  role: string;
  hasPwc: boolean;
  isLeader: boolean;
}

/** 逗子SLSC 2026シーズン名簿 #1-68 */
const ZUSHI_2026_ROSTER: RosterEntry[] = [
  // 3年 (#1-22)
  { name: '男沢 壮真', grade: '3年', role: '監視長', hasPwc: true, isLeader: true },
  { name: '川崎 太暉', grade: '3年', role: '副監視長', hasPwc: false, isLeader: true },
  { name: 'ガンディー 咲', grade: '3年', role: '副監視長', hasPwc: false, isLeader: true },
  { name: '齊藤 弘桔', grade: '3年', role: 'ガード委員長', hasPwc: true, isLeader: false },
  { name: '野元 耕太朗', grade: '3年', role: 'ガード・イベント分科長', hasPwc: false, isLeader: false },
  { name: '高野 果実', grade: '3年', role: 'ガード・救護分科長', hasPwc: false, isLeader: false },
  { name: '福田 侑', grade: '3年', role: '競技委員長', hasPwc: true, isLeader: false },
  { name: '佐藤 生都', grade: '3年', role: '器材委員長・PWC学生代表', hasPwc: true, isLeader: false },
  { name: '宇佐美 英介', grade: '3年', role: '宿長', hasPwc: false, isLeader: false },
  { name: '塚本 颯馬', grade: '3年', role: 'レク委員長', hasPwc: true, isLeader: false },
  { name: '鈴木 大介', grade: '3年', role: 'レク・新歓分科長', hasPwc: false, isLeader: false },
  { name: '久保田 彩未', grade: '3年', role: 'ジュニア委員長', hasPwc: false, isLeader: false },
  { name: '桑野 友輝', grade: '3年', role: '競技', hasPwc: false, isLeader: false },
  { name: '小笠原 帆風', grade: '3年', role: '競技', hasPwc: false, isLeader: false },
  { name: '川邉 里奈', grade: '3年', role: '器材', hasPwc: false, isLeader: false },
  { name: '鈴木 知明', grade: '3年', role: '器材', hasPwc: false, isLeader: false },
  { name: '上木 崚平', grade: '3年', role: 'レク', hasPwc: false, isLeader: false },
  { name: '田口 実尚', grade: '3年', role: 'レク', hasPwc: false, isLeader: false },
  { name: '森嶋 慧太郎', grade: '3年', role: 'レク', hasPwc: false, isLeader: false },
  { name: '島津 佳歩', grade: '3年', role: 'ジュニア', hasPwc: false, isLeader: false },
  { name: '辻本 珠才', grade: '3年', role: 'ジュニア', hasPwc: false, isLeader: false },
  { name: '田中 沙菜', grade: '3年', role: 'ジュニア', hasPwc: false, isLeader: false },
  // 4年 (#23-33)
  { name: '大森 海依', grade: '4年', role: 'ガード', hasPwc: true, isLeader: false },
  { name: '梅澤 倫太朗', grade: '4年', role: 'レク', hasPwc: true, isLeader: false },
  { name: '熊井戸 里咲', grade: '4年', role: '競技', hasPwc: true, isLeader: false },
  { name: '渡辺 誠吾', grade: '4年', role: 'ガード', hasPwc: true, isLeader: false },
  { name: '高松 創太', grade: '4年', role: '競技', hasPwc: false, isLeader: false },
  { name: '松永 海輝', grade: '4年', role: '器材', hasPwc: true, isLeader: false },
  { name: '小宮山 皓太', grade: '4年', role: '器材', hasPwc: true, isLeader: false },
  { name: '山岡 杏未', grade: '4年', role: 'レク', hasPwc: false, isLeader: false },
  { name: '岡安 幹', grade: '4年', role: 'PWC学生代表・ガード', hasPwc: true, isLeader: false },
  { name: '福永 将士', grade: '4年', role: 'ジュニア', hasPwc: true, isLeader: false },
  { name: '横井 暖菜', grade: '4年', role: 'ジュニア', hasPwc: false, isLeader: false },
  // 2年 (#34-53)
  { name: '田 樹莉', grade: '2年', role: 'ガード', hasPwc: true, isLeader: false },
  { name: '古川 穂波', grade: '2年', role: 'ガード', hasPwc: false, isLeader: false },
  { name: '坂本 真心', grade: '2年', role: 'ガード', hasPwc: false, isLeader: false },
  { name: '小林 里琉希', grade: '2年', role: 'ガード', hasPwc: false, isLeader: false },
  { name: '秋本 大地', grade: '2年', role: 'ガード', hasPwc: false, isLeader: false },
  { name: '清水 孝太朗', grade: '2年', role: '競技', hasPwc: false, isLeader: false },
  { name: '川又 彩乃', grade: '2年', role: '競技', hasPwc: false, isLeader: false },
  { name: '奥山 徹也', grade: '2年', role: '競技', hasPwc: false, isLeader: false },
  { name: '髙橋 愛乃', grade: '2年', role: '競技', hasPwc: false, isLeader: false },
  { name: '関 栞汰', grade: '2年', role: '器材', hasPwc: false, isLeader: false },
  { name: '木下 野々夏', grade: '2年', role: '器材', hasPwc: false, isLeader: false },
  { name: '岩﨑 颯太', grade: '2年', role: '器材', hasPwc: false, isLeader: false },
  { name: '田中 優衣', grade: '2年', role: '器材', hasPwc: false, isLeader: false },
  { name: '鈴木 柊', grade: '2年', role: 'レク', hasPwc: false, isLeader: false },
  { name: '阪井 碧', grade: '2年', role: 'レク', hasPwc: false, isLeader: false },
  { name: '山口 晏奈', grade: '2年', role: 'レク', hasPwc: false, isLeader: false },
  { name: '加部 里紗', grade: '2年', role: 'ジュニア', hasPwc: false, isLeader: false },
  { name: '山口 璃桜', grade: '2年', role: 'ジュニア', hasPwc: false, isLeader: false },
  { name: '太田 七海', grade: '2年', role: 'ジュニア', hasPwc: false, isLeader: false },
  { name: '秋山 英彪', grade: '2年', role: 'ジュニア', hasPwc: false, isLeader: false },
  // 新入生15人 (#54-68)
  { name: '新入生1', grade: '1年', role: 'ガード委員', hasPwc: false, isLeader: false },
  { name: '新入生2', grade: '1年', role: '競技', hasPwc: false, isLeader: false },
  { name: '新入生3', grade: '1年', role: '器材', hasPwc: false, isLeader: false },
  { name: '新入生4', grade: '1年', role: 'レク', hasPwc: false, isLeader: false },
  { name: '新入生5', grade: '1年', role: 'ジュニア', hasPwc: false, isLeader: false },
  { name: '新入生6', grade: '1年', role: 'ガード委員', hasPwc: false, isLeader: false },
  { name: '新入生7', grade: '1年', role: '競技', hasPwc: false, isLeader: false },
  { name: '新入生8', grade: '1年', role: '器材', hasPwc: false, isLeader: false },
  { name: '新入生9', grade: '1年', role: 'レク', hasPwc: false, isLeader: false },
  { name: '新入生10', grade: '1年', role: 'ジュニア', hasPwc: false, isLeader: false },
  { name: '新入生11', grade: '1年', role: 'ガード委員', hasPwc: false, isLeader: false },
  { name: '新入生12', grade: '1年', role: '競技', hasPwc: false, isLeader: false },
  { name: '新入生13', grade: '1年', role: '器材', hasPwc: false, isLeader: false },
  { name: '新入生14', grade: '1年', role: 'レク', hasPwc: false, isLeader: false },
  { name: '新入生15', grade: '1年', role: 'ジュニア', hasPwc: false, isLeader: false },
];

type Status = 'yes' | 'am' | 'pm' | 'undecided' | 'no';

// 7月: 未定/午前/午後が多めの「バラけたシーズン前半」の感じ
const WEIGHTS_JULY: { s: Status; w: number }[] = [
  { s: 'yes', w: 3 },
  { s: 'am', w: 3 },
  { s: 'pm', w: 2 },
  { s: 'undecided', w: 2 },
  { s: 'no', w: 2 },
];
// 8月9月: 終日○多め
const WEIGHTS_LATE: { s: Status; w: number }[] = [
  { s: 'yes', w: 7 },
  { s: 'am', w: 1 },
  { s: 'pm', w: 1 },
  { s: 'undecided', w: 1 },
  { s: 'no', w: 2 },
];

function pick(list: { s: Status; w: number }[]): Status {
  const total = list.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  for (const it of list) {
    r -= it.w;
    if (r <= 0) return it.s;
  }
  return list[0].s;
}

async function clearCollection(name: string) {
  if (!db) return;
  const snap = await getDocs(collection(db, name));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + 450)) batch.delete(d.ref);
    await batch.commit();
  }
}

/**
 * 全データリセット → 68人student + seasonDays + 各人availability 投入。
 */
export async function seedZushi2026(): Promise<{
  students: number;
  days: number;
  availability: number;
}> {
  if (!db) throw new Error('Firestore未初期化');

  // 1) 既存の学生/シフト/可否/seasonDaysを全削除
  await clearCollection('students');
  await clearCollection('shifts');
  await clearCollection('availability');
  await clearCollection('seasonDays');

  // 2) settingsのシーズン期間と月予算・配分履歴を2026用にリセット
  const sb = writeBatch(db);
  sb.update(doc(db, 'settings', 'main'), {
    seasonStart: '2026-07-03',
    seasonEnd: '2026-09-06',
    monthlyBudgets: { '2026-07': 2000000, '2026-08': 2500000, '2026-09': 500000 },
    allocatedMonths: [],
    availabilityLocked: false,
  });
  await sb.commit();

  // 3) seasonDays を 2026-07-03 〜 2026-09-06 で生成
  const start = parseISO('2026-07-03');
  const end = parseISO('2026-09-06');
  const dates = eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'));
  for (let i = 0; i < dates.length; i += 450) {
    const chunk = dates.slice(i, i + 450);
    const batch = writeBatch(db);
    for (const d of chunk) batch.set(doc(db, 'seasonDays', d), { isOpen: true, note: '' });
    await batch.commit();
  }

  // 4) 学生を投入 (PIN=0101固定)
  const pinHash = hashPin('0101');
  const studentIds: string[] = [];
  for (let i = 0; i < ZUSHI_2026_ROSTER.length; i += 450) {
    const chunk = ZUSHI_2026_ROSTER.slice(i, i + 450);
    const batch = writeBatch(db);
    for (const entry of chunk) {
      const id = crypto.randomUUID();
      studentIds.push(id);
      batch.set(doc(db, 'students', id), {
        name: entry.name,
        nameKana: '',
        pinHash,
        isActive: true,
        joinYear: 2026,
        grade: entry.grade,
        role: entry.role,
        hasPwc: entry.hasPwc,
        isLeader: entry.isLeader,
        birthday: '0101',
      });
    }
    await batch.commit();
  }

  // 5) 各学生 × 各日 でランダム可否を生成
  const now = new Date().toISOString();
  interface AvailDoc {
    id: string;
    data: {
      studentId: string;
      date: string;
      available: boolean;
      status: Status;
      note: string;
      submittedAt: string;
    };
  }
  const availDocs: AvailDoc[] = [];
  for (const sid of studentIds) {
    for (const date of dates) {
      const isJuly = date.startsWith('2026-07');
      const status = pick(isJuly ? WEIGHTS_JULY : WEIGHTS_LATE);
      const note =
        status === 'undecided' && Math.random() < 0.3
          ? '部活/バイトで変動あり、要連絡'
          : '';
      availDocs.push({
        id: crypto.randomUUID(),
        data: {
          studentId: sid,
          date,
          available: status === 'yes' || status === 'am' || status === 'pm',
          status,
          note,
          submittedAt: now,
        },
      });
    }
  }
  for (let i = 0; i < availDocs.length; i += 450) {
    const chunk = availDocs.slice(i, i + 450);
    const batch = writeBatch(db);
    for (const ad of chunk) batch.set(doc(db, 'availability', ad.id), ad.data);
    await batch.commit();
  }

  return {
    students: studentIds.length,
    days: dates.length,
    availability: availDocs.length,
  };
}
