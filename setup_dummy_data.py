import sqlite3
import random
from datetime import date, timedelta

# --- 設定 ---
DB_NAME = 'lifesaving_app.db'
START_DATE = date(2025, 6, 27)
END_DATE = date(2025, 8, 31)

# 架空のメンバーリスト (名前, 学年)
DUMMY_MEMBERS = [
    ("佐藤 大輝", 4), ("鈴木 結衣", 4),
    ("高橋 蓮", 3), ("田中 美咲", 3), ("伊藤 翔太", 3),
    ("渡辺 陽菜", 2), ("山本 健太", 2), ("中村 あかり", 2),
    ("小林 拓海", 1), ("加藤 さくら", 1)
]

# 希望シフトの種類と、それぞれの出現率（合計で1になるように）
AVAILABILITY_TYPES = ['full_day', 'am_only', 'pm_only', 'unavailable']
WEIGHTS = [0.5, 0.1, 0.1, 0.3] # 50%で終日OK, 10%で午前, 10%で午後, 30%で不可

# --- 処理の開始 ---

# データベースに接続
connection = sqlite3.connect(DB_NAME)
cursor = connection.cursor()

# 1. 既存のデータをクリアする（何度実行しても同じ状態から始められるように）
print("古いデータを削除しています...")
cursor.execute("DELETE FROM availability")
cursor.execute("DELETE FROM members")
# IDのカウントをリセット
cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('members', 'availability')")
print("古いデータを削除しました。")


# 2. 架空のメンバーを登録
print("新しいメンバーを登録しています...")
cursor.executemany("INSERT INTO members (name, grade) VALUES (?, ?)", DUMMY_MEMBERS)
print(f"{len(DUMMY_MEMBERS)}人のメンバーを登録しました。")


# 3. 架空の希望シフトを大量に生成
print("希望シフトを生成・登録しています...")
availability_data = []
# まずは登録したメンバーのIDを全て取得
cursor.execute("SELECT id FROM members")
member_ids = [row[0] for row in cursor.fetchall()]

# 日付を一日ずつ進めるループ
current_date = START_DATE
while current_date <= END_DATE:
    # 各メンバーごとに希望を生成
    for member_id in member_ids:
        # 重み付きでランダムに希望を選択
        availability_type = random.choices(AVAILABILITY_TYPES, weights=WEIGHTS, k=1)[0]
        availability_data.append((member_id, current_date.strftime("%Y-%m-%d"), availability_type))
    current_date += timedelta(days=1)

# 生成した希望シフトデータをまとめてデータベースに登録
cursor.executemany("INSERT INTO availability (member_id, shift_date, availability_type) VALUES (?, ?, ?)", availability_data)
print(f"{len(availability_data)}件の希望シフトを登録しました。")


# 変更を確定し、接続を閉じる
connection.commit()
connection.close()

print("\nダミーデータの作成が完了しました。")