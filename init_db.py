import sqlite3

# データベースファイルの名前
DB_NAME = 'lifesaving_app.db'

# データベースに接続（ファイルがなければ自動的に作成される）
connection = sqlite3.connect(DB_NAME)
cursor = connection.cursor()

# --- テーブルを作成するためのSQL文 ---

# membersテーブルの設計図
cursor.execute('''
CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    grade INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT 1
)
''')

# availabilityテーブルの設計図
cursor.execute('''
CREATE TABLE IF NOT EXISTS availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    shift_date TEXT NOT NULL,
    availability_type TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id),
    UNIQUE (member_id, shift_date)
)
''')

# shift_settingsテーブルの設計図
# (今回は簡単にするため、このテーブルは一旦作成せず、プログラム内で直接設定します)

# shiftsテーブルの設計図
cursor.execute('''
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    shift_date TEXT NOT NULL,
    shift_type TEXT NOT NULL,
    payment_type TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id)
)
''')


# 変更を確定
connection.commit()

# 接続を閉じる
connection.close()

print(f"データベース '{DB_NAME}' とテーブルが正常に作成されました。")