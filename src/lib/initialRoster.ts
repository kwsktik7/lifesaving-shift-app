/**
 * 2026シーズン初期名簿。PDF「20260404逗子名簿公開用.pdf」#1〜#53 をハードコード。
 * セットアップボタン押下時に一括投入され、order は名簿の通し番号に対応する。
 * シフト表・勤怠表もこの order 順で並ぶ (utils/studentSort 経由)。
 *
 * 役職について:
 *   - PDF の「~委員長」「~分科科長」などの兼任表記はメインカテゴリ (ガード/競技/競材/レク/ジュニア)
 *     に丸めて保存している。委員長などの管理運営の役割はシフト管理アプリの範囲外。
 *   - 監視長 / 副監視長 のみ isLeader=true (シフト生成に影響する役職)。
 */

export interface InitialRosterRow {
  order: number;
  name: string;
  grade: string;   // GRADE_OPTIONS と一致 ('2年'|'3年'|'4年')
  role: string;    // '監視長'|'副監視長'|'ガード'|'競技'|'競材'|'レク'|'ジュニア'|'その他'
  hasPwc: boolean;
}

export const INITIAL_ROSTER: InitialRosterRow[] = [
  // #1〜#33 (3年・4年)
  { order: 1,  name: '男沢 壮真',     grade: '3年', role: '監視長',   hasPwc: false },
  { order: 2,  name: '川崎 太暉',     grade: '3年', role: '副監視長', hasPwc: false },
  { order: 3,  name: 'ガンディー 一咲', grade: '3年', role: '副監視長', hasPwc: false },
  { order: 4,  name: '齊藤 弘樹',     grade: '3年', role: 'ガード',   hasPwc: false },
  { order: 5,  name: '野元 耕太朗',   grade: '3年', role: 'ガード',   hasPwc: false },
  { order: 6,  name: '髙野 果実',     grade: '3年', role: 'ガード',   hasPwc: false },
  { order: 7,  name: '福田 侑',       grade: '3年', role: '競技',     hasPwc: false },
  { order: 8,  name: '佐藤 主郁',     grade: '3年', role: '競材',     hasPwc: true  },
  { order: 9,  name: '宇佐美 英介',   grade: '3年', role: 'その他',   hasPwc: false },
  { order: 10, name: '塚本 鳳凧',     grade: '3年', role: 'レク',     hasPwc: false },
  { order: 11, name: '鈴木 大介',     grade: '3年', role: 'レク',     hasPwc: false },
  { order: 12, name: '久保田 彩未',   grade: '3年', role: 'ジュニア', hasPwc: false },
  { order: 13, name: '桑野 友輝',     grade: '3年', role: '競技',     hasPwc: false },
  { order: 14, name: '小宮原 暁風',   grade: '3年', role: '競技',     hasPwc: false },
  { order: 15, name: '川邊 翠奈',     grade: '3年', role: '競材',     hasPwc: false },
  { order: 16, name: '鈴木 知朗',     grade: '3年', role: '競材',     hasPwc: false },
  { order: 17, name: '上木 蜂平',     grade: '3年', role: 'レク',     hasPwc: false },
  { order: 18, name: '田口 実尚',     grade: '3年', role: 'レク',     hasPwc: false },
  { order: 19, name: '森崎 慧太郎',   grade: '3年', role: 'レク',     hasPwc: false },
  { order: 20, name: '居澤 佳歩',     grade: '3年', role: 'ジュニア', hasPwc: false },
  { order: 21, name: '辻本 玲子',     grade: '3年', role: 'ジュニア', hasPwc: false },
  { order: 22, name: '田中 沙菜',     grade: '3年', role: 'ジュニア', hasPwc: false },
  { order: 23, name: '大塚 海依',     grade: '4年', role: 'ガード',   hasPwc: true  },
  { order: 24, name: '梅澤 偵太朗',   grade: '4年', role: 'その他',   hasPwc: false },
  { order: 25, name: '熊井戸 里咲',   grade: '4年', role: '競技',     hasPwc: false },
  { order: 26, name: '渡辺 誠吾',     grade: '4年', role: 'その他',   hasPwc: false },
  { order: 27, name: '高松 颯太',     grade: '4年', role: 'その他',   hasPwc: true  },
  { order: 28, name: '松永 海輝',     grade: '4年', role: '競材',     hasPwc: false },
  { order: 29, name: '小宮山 皓太',   grade: '4年', role: 'その他',   hasPwc: false },
  { order: 30, name: '山岡 杏未',     grade: '4年', role: 'レク',     hasPwc: false },
  { order: 31, name: '岡安 幹',       grade: '4年', role: 'ガード',   hasPwc: false },
  { order: 32, name: '福永 翔士',     grade: '4年', role: 'ジュニア', hasPwc: false },
  { order: 33, name: '横井 暖夏',     grade: '4年', role: 'その他',   hasPwc: false },
  // #34〜#53 (2年)
  { order: 34, name: '田 莉莉',       grade: '2年', role: 'ガード',   hasPwc: false },
  { order: 35, name: '古川 穂渡',     grade: '2年', role: 'ガード',   hasPwc: false },
  { order: 36, name: '坂本 真心',     grade: '2年', role: 'その他',   hasPwc: false },
  { order: 37, name: '小林 里瑞希',   grade: '2年', role: 'ガード',   hasPwc: false },
  { order: 38, name: '秋永 大瑚',     grade: '2年', role: '競技',     hasPwc: false },
  { order: 39, name: '清水 孝太朗',   grade: '2年', role: '競技',     hasPwc: false },
  { order: 40, name: '川又 莎乃',     grade: '2年', role: '競技',     hasPwc: false },
  { order: 41, name: '奥山 徹也',     grade: '2年', role: '競技',     hasPwc: false },
  { order: 42, name: '高橋 愛乃',     grade: '2年', role: '競材',     hasPwc: false },
  { order: 43, name: '関 友汰',       grade: '2年', role: '競材',     hasPwc: false },
  { order: 44, name: '木下 野々夏',   grade: '2年', role: '競材',     hasPwc: false },
  { order: 45, name: '岩崎 颯太',     grade: '2年', role: '競材',     hasPwc: false },
  { order: 46, name: '田中 優衣',     grade: '2年', role: '競材',     hasPwc: false },
  { order: 47, name: '鈴木 桜',       grade: '2年', role: 'レク',     hasPwc: false },
  { order: 48, name: '阪井 馨',       grade: '2年', role: 'レク',     hasPwc: false },
  { order: 49, name: '山口 愛奈',     grade: '2年', role: 'レク',     hasPwc: false },
  { order: 50, name: '加部 里紗',     grade: '2年', role: 'ジュニア', hasPwc: false },
  { order: 51, name: '口口 璃彩',     grade: '2年', role: 'ジュニア', hasPwc: false },
  { order: 52, name: '太田 七海',     grade: '2年', role: 'ジュニア', hasPwc: false },
  { order: 53, name: '秋山 笑志',     grade: '2年', role: 'ジュニア', hasPwc: false },
];
