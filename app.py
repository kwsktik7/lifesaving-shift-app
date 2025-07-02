from flask import Flask, g, redirect, url_for, render_template, request, flash
import sqlite3
import pandas as pd
from datetime import date, timedelta
# algorithm.pyから必要な関数と変数をインポート
from algorithm import generate_all_shifts, START_DATE, END_DATE

# --- アプリケーションの基本設定 ---
DB_NAME = 'lifesaving_app.db'
app = Flask(__name__)
app.secret_key = 'your-super-secret-key-please-change' # 実際にはもっと複雑な文字列に変更してください

# --- データベース接続の管理 ---
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DB_NAME)
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

# --- 各Webページの処理（ルーティング） ---

@app.route('/')
def login_page():
    """アプリの入り口となる、ログイン/新規登録ページを表示します。"""
    cursor = get_db().cursor()
    cursor.execute("SELECT id, name, grade FROM members WHERE is_active = 1 ORDER BY grade, name")
    members = cursor.fetchall()
    members_list = [{'id': row[0], 'name': row[1], 'grade': row[2]} for row in members]
    return render_template('login.html', members=members_list)

@app.route('/login', methods=['POST'])
def login():
    """既存メンバーのログイン処理"""
    member_id = request.form.get('member_id')
    if not member_id:
        flash("名前を選択してください。", "error")
        return redirect(url_for('login_page'))
    return redirect(url_for('submit_availability', member_id=member_id))

@app.route('/register', methods=['POST'])
def register():
    """新規メンバーの登録処理"""
    name = request.form.get('name', '').strip()
    grade = request.form.get('grade')
    
    if not name or not grade:
        flash("名前と学年を入力してください。", "error")
        return redirect(url_for('login_page'))

    db = get_db()
    cursor = db.cursor()
    
    cursor.execute("SELECT id FROM members WHERE name = ? AND is_active = 1", (name,))
    if cursor.fetchone():
        flash(f"エラー: 「{name}」は既に登録されています。一覧から選択してください。", "error")
        return redirect(url_for('login_page'))
    
    cursor.execute("INSERT INTO members (name, grade, is_active) VALUES (?, ?, ?)", (name, grade, 1))
    new_member_id = cursor.lastrowid
    db.commit()
    
    flash(f"ようこそ、{name}さん！メンバーとして登録しました。", "success")
    return redirect(url_for('submit_availability', member_id=new_member_id))


@app.route('/submit/<int:member_id>', methods=['GET', 'POST'])
def submit_availability(member_id):
    """希望シフトの一括提出ページ"""
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT name, grade FROM members WHERE id = ? AND is_active = 1", (member_id,))
    member_info = cursor.fetchone()
    if not member_info:
        flash("指定されたメンバーが見つかりません。ログインからやり直してください。", "error")
        return redirect(url_for('login_page'))
    
    selected_member_name = member_info[0]

    if request.method == 'POST':
        availability_data_to_save = []
        current_date = START_DATE
        while current_date <= END_DATE:
            date_str = current_date.strftime('%Y-%m-%d')
            availability_type = request.form.get(f"availability_{date_str}")
            if availability_type:
                availability_data_to_save.append((member_id, date_str, availability_type))
            current_date += timedelta(days=1)

        try:
            cursor.executemany(
                "INSERT OR REPLACE INTO availability (member_id, shift_date, availability_type) VALUES (?, ?, ?)",
                availability_data_to_save
            )
            db.commit()
            flash("全ての希望シフトを更新しました！", "success")
        except Exception as e:
            db.rollback()
            flash(f"データベースの更新中にエラーが発生しました: {e}", "error")

        # ★★★ ここを修正 ★★★
        # 処理が終わったら、ログインページ（ホーム）にリダイレクトする
        return redirect(url_for('login_page'))

    # GETリクエスト時の処理
    days = []
    weekdays_jp = ["月", "火", "水", "木", "金", "土", "日"]
    current_date = START_DATE
    while current_date <= END_DATE:
        days.append({'date': current_date, 'weekday': weekdays_jp[current_date.weekday()]})
        current_date += timedelta(days=1)
    
    availability = {}
    cursor.execute("SELECT shift_date, availability_type FROM availability WHERE member_id = ?", (member_id,))
    for row in cursor.fetchall():
        availability[row[0]] = row[1]
            
    return render_template('submit_form.html', 
                           selected_member_id=member_id,
                           selected_member_name=selected_member_name,
                           days=days, 
                           availability=availability)

# --- 管理者向けページ（変更なし） ---

@app.route('/admin')
def admin_dashboard():
    return render_template('admin_dashboard.html')

@app.route('/run-algorithm')
def run_algorithm_route():
    try:
        generate_all_shifts()
        flash("シフトの自動生成が完了しました！", "success")
    except Exception as e:
        flash(f"シフト生成中にエラーが発生しました: {e}", "error")
    return redirect(url_for('schedule'))

@app.route('/schedule')
def schedule():
    db = get_db()
    try:
        query = "SELECT s.shift_date AS '日付', m.name AS 'メンバー名', s.payment_type AS '給与タイプ' FROM shifts s JOIN members m ON s.member_id = m.id ORDER BY s.shift_date, m.name;"
        df = pd.read_sql_query(query, db)
        if not df.empty:
            df['給与タイプ'] = df['給与タイプ'].replace({'type_1': '1', 'type_V': 'V'})
            table_html = df.to_html(classes='striped', index=False, border=0)
        else:
            table_html = "<p>まだシフトが生成されていません。</p>"
        return render_template('schedule.html', table_html=table_html)
    except Exception as e:
        flash(f"エラーが発生しました: {e}", "error")
        return render_template('schedule.html', table_html="<p>シフト表の表示中にエラーが発生しました。</p>")

@app.route('/check-availability')
def check_availability():
    db = get_db()
    try:
        query = "SELECT a.shift_date AS '日付', m.name AS 'メンバー名', a.availability_type AS '希望' FROM availability a JOIN members m ON a.member_id = m.id ORDER BY a.shift_date DESC, m.name;"
        df = pd.read_sql_query(query, db)
        if not df.empty:
            df['希望'] = df['希望'].replace({'full_day': '1日入れる', 'am_only': '午前のみ', 'pm_only': '午後のみ', 'unavailable': '入れない'})
            table_html = df.to_html(classes='striped', index=False, border=0)
        else:
            table_html = "<p>まだ希望シフトが提出されていません。</p>"
        return render_template('check_availability.html', table_html=table_html)
    except Exception as e:
        flash(f"エラーが発生しました: {e}", "error")
        return render_template('check_availability.html', table_html="<p>希望シフトの表示中にエラーが発生しました。</p>")

# このファイルが `python app.py` で直接実行された場合のみ、テスト用のサーバーを起動
if __name__ == '__main__':
    app.run(debug=True)
