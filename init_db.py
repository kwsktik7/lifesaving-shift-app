import sqlite3

DB_NAME = 'lifesaving_app.db'
connection = sqlite3.connect(DB_NAME)
cursor = connection.cursor()

# --- テーブルを作成するためのSQL文 ---

# メンバー情報を保存するテーブル
cursor.execute('''
CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    grade INTEGER NOT NULL,
    position TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1
)
''')

# 希望シフトを保存するテーブル
cursor.execute('''
CREATE TABLE IF NOT EXISTS availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    shift_date TEXT NOT NULL,
    availability_type TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    UNIQUE (member_id, shift_date)
)
''')

# 確定シフトを保存するテーブル
cursor.execute('''
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    shift_date TEXT NOT NULL,
    shift_type TEXT NOT NULL,
    payment_type TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
)
''')

# 事務レポート用の集計結果を保存するテーブル
cursor.execute('''
CREATE TABLE IF NOT EXISTS shift_summary (
    member_id INTEGER PRIMARY KEY,
    total_days INTEGER NOT NULL,
    type_1_days INTEGER NOT NULL,
    type_v_days INTEGER NOT NULL,
    v_ratio REAL NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
)
''')

# 外部キー制約を有効にする
cursor.execute("PRAGMA foreign_keys = ON")

connection.commit()
connection.close()

print(f"データベース '{DB_NAME}' とテーブルが正常に作成されました。")
