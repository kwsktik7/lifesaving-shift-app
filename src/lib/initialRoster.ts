/**
 * 2026シーズン初期名簿。PDF「20260328逗子名簿公開用.pdf」#1〜#53 をハードコード。
 * セットアップボタン押下時に一括投入され、order は名簿の通し番号に対応する。
 * シフト表・勤怠表もこの order 順で並ぶ (utils/studentSort 経由)。
 *
 * 役職について:
 *   - PDF の「~委員長」「~分科長」などの兼任表記はメインカテゴリ
 *     (ガード/競技/器材/レク/ジュニア/その他) に丸めて保存している。
 *   - 監視長 / 副監視長 のみ isLeader=true (シフト生成に影響する役職)。
 *   - 名簿に存在しないカテゴリは AdminSettings の runInitialSetup が
 *     settings.roles に自動 merge する。
 */

export interface InitialRosterRow {
  order: number;
  name: string;
  grade: string;   // GRADE_OPTIONS と一致 ('2年'|'3年'|'4年')
  role: string;    // '監視長'|'副監視長'|'ガード'|'競技'|'器材'|'レク'|'ジュニア'|'その他'
  hasPwc: boolean;
}

export const INITIAL_ROSTER: InitialRosterRow[] = [
  // #1〜#22 (3年)
  { order: 1,  name: '男沢 壮真',     grade: '3年', role: '監視長',   hasPwc: true  },
  { order: 2,  name: '川崎 太暉',     grade: '3年', role: '副監視長', hasPwc: true  },
  { order: 3,  name: 'ガンディー 咲', grade: '3年', role: '副監視長', hasPwc: false },
  { order: 4,  name: '齊藤 弘桔',     grade: '3年', role: 'ガード',   hasPwc: true  },
  { order: 5,  name: '野元 耕太朗',   grade: '3年', role: 'ガード',   hasPwc: false },
  { order: 6,  name: '髙野 果実',     grade: '3年', role: 'ガード',   hasPwc: false },
  { order: 7,  name: '福田 侑',       grade: '3年', role: '競技',     hasPwc: true  },
  { order: 8,  name: '佐藤 生都',     grade: '3年', role: '器材',     hasPwc: true  },
  { order: 9,  name: '宇佐美 英介',   grade: '3年', role: 'その他',   hasPwc: false },
  { order: 10, name: '塚本 颯馬',     grade: '3年', role: 'レク',     hasPwc: false },
  { order: 11, name: '鈴木 大介',     grade: '3年', role: 'レク',     hasPwc: false },
  { order: 12, name: '久保田 彩未',   grade: '3年', role: 'ジュニア', hasPwc: false },
  { order: 13, name: '桑野 友輝',     grade: '3年', role: '競技',     hasPwc: false },
  { order: 14, name: '小笠原 帆風',   grade: '3年', role: '競技',     hasPwc: false },
  { order: 15, name: '川邉 里奈',     grade: '3年', role: '器材',     hasPwc: false },
  { order: 16, name: '鈴木 知明',     grade: '3年', role: '器材',     hasPwc: false },
  { order: 17, name: '上木 崚平',     grade: '3年', role: 'レク',     hasPwc: false },
  { order: 18, name: '田口 実尚',     grade: '3年', role: 'レク',     hasPwc: false },
  { order: 19, name: '森嶋 慧太郎',   grade: '3年', role: 'レク',     hasPwc: false },
  { order: 20, name: '島津 佳歩',     grade: '3年', role: 'ジュニア', hasPwc: false },
  { order: 21, name: '辻本 珠才',     grade: '3年', role: 'ジュニア', hasPwc: false },
  { order: 22, name: '田中 沙菜',     grade: '3年', role: 'ジュニア', hasPwc: false },
  // #23〜#33 (4年)
  { order: 23, name: '大森 海依',     grade: '4年', role: 'ガード',   hasPwc: true  },
  { order: 24, name: '梅澤 倫太朗',   grade: '4年', role: 'レク',     hasPwc: true  },
  { order: 25, name: '熊井戸 里咲',   grade: '4年', role: '競技',     hasPwc: true  },
  { order: 26, name: '渡辺 誠吾',     grade: '4年', role: 'ガード',   hasPwc: true  },
  { order: 27, name: '高松 創太',     grade: '4年', role: '競技',     hasPwc: false },
  { order: 28, name: '松永 海輝',     grade: '4年', role: '器材',     hasPwc: false },
  { order: 29, name: '小宮山 皓太',   grade: '4年', role: '器材',     hasPwc: false },
  { order: 30, name: '山岡 杏未',     grade: '4年', role: 'レク',     hasPwc: false },
  { order: 31, name: '岡安 幹',       grade: '4年', role: 'ガード',   hasPwc: true  },
  { order: 32, name: '福永 将士',     grade: '4年', role: 'ジュニア', hasPwc: true  },
  { order: 33, name: '横井 暖菜',     grade: '4年', role: 'ジュニア', hasPwc: false },
  // #34〜#53 (2年)
  { order: 34, name: '田 樹莉',       grade: '2年', role: 'ガード',   hasPwc: true  },
  { order: 35, name: '古川 穂波',     grade: '2年', role: 'ガード',   hasPwc: false },
  { order: 36, name: '坂本 真心',     grade: '2年', role: 'ガード',   hasPwc: false },
  { order: 37, name: '小林 里琉希',   grade: '2年', role: 'ガード',   hasPwc: false },
  { order: 38, name: '秋本 大地',     grade: '2年', role: 'ガード',   hasPwc: false },
  { order: 39, name: '清水 孝太朗',   grade: '2年', role: '競技',     hasPwc: false },
  { order: 40, name: '川又 彩乃',     grade: '2年', role: '競技',     hasPwc: false },
  { order: 41, name: '奥山 徹也',     grade: '2年', role: '競技',     hasPwc: false },
  { order: 42, name: '髙橋 愛乃',     grade: '2年', role: '競技',     hasPwc: false },
  { order: 43, name: '関 栞汰',       grade: '2年', role: '器材',     hasPwc: false },
  { order: 44, name: '木下 野々夏',   grade: '2年', role: '器材',     hasPwc: false },
  { order: 45, name: '岩崎 颯太',     grade: '2年', role: '器材',     hasPwc: false },
  { order: 46, name: '田中 優衣',     grade: '2年', role: '器材',     hasPwc: false },
  { order: 47, name: '鈴木 柊',       grade: '2年', role: 'レク',     hasPwc: false },
  { order: 48, name: '阪井 碧',       grade: '2年', role: 'レク',     hasPwc: false },
  { order: 49, name: '山口 晏奈',     grade: '2年', role: 'レク',     hasPwc: false },
  { order: 50, name: '加部 里紗',     grade: '2年', role: 'ジュニア', hasPwc: false },
  { order: 51, name: '山口 璃桜',     grade: '2年', role: 'ジュニア', hasPwc: false },
  { order: 52, name: '太田 七海',     grade: '2年', role: 'ジュニア', hasPwc: false },
  { order: 53, name: '秋山 英彪',     grade: '2年', role: 'ジュニア', hasPwc: false },
];
