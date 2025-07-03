from flask import Flask, g, redirect, url_for, render_template, request, flash
import sqlite3
import pandas as pd
from datetime import date, timedelta
from algorithm import generate_all_shifts, START_DATE, END_DATE

# --- アプリケーションの基本設定 ---
DB_NAME = 'lifesaving_app.db'
app = Flask(__name__)
app.secret_key = 'your-super-secret-key-please-change' 

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
    cursor = get_db().cursor()
    cursor.execute("SELECT id, name, grade FROM members WHERE is_active = 1 ORDER BY grade, name")
    members = cursor.fetchall()
    members_list = [{'id': row[0], 'name': row[1], 'grade': row[2]} for row in members]
    return render_template('login.html', members=members_list)

@app.route('/login', methods=['POST'])
def login():
    member_id = request.form.get('member_id')
    if not member_id:
        flash("名前を選択してください。", "error")
        return redirect(url_for('login_page'))
    return redirect(url_for('submit_availability', member_id=member_id))

@app.route('/register', methods=['POST'])
def register():
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
        except Exception as e:
            db.rollback()
            flash(f"データベースの更新中にエラーが発生しました: {e}", "error")
            return redirect(url_for('submit_availability', member_id=member_id))

        # ★★★ 処理が終わったら、新しい完了ページに移動する ★★★
        return redirect(url_for('success_page'))

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

# ★★★ 新しい完了ページ用のルートを追加 ★★★
@app.route('/success')
def success_page():
    """提出完了ページを表示"""
    return render_template('submit_success.html')


# --- 管理者向けページ ---

@app.route('/admin')
def admin_dashboard():
    return render_template('admin_dashboard.html')

@app.route('/manage-members')
def manage_members():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT id, name, grade FROM members WHERE is_active = 1 ORDER BY grade DESC, name ASC")
    members_list = [{'id': row[0], 'name': row[1], 'grade': row[2]} for row in cursor.fetchall()]
    return render_template('manage_members.html', members=members_list)

@app.route('/delete-member/<int:member_id>', methods=['POST'])
def delete_member(member_id):
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute("DELETE FROM shifts WHERE member_id = ?", (member_id,))
        cursor.execute("DELETE FROM availability WHERE member_id = ?", (member_id,))
        cursor.execute("DELETE FROM members WHERE id = ?", (member_id,))
        db.commit()
        flash("メンバーを完全に削除しました。", "success")
    except Exception as e:
        db.rollback()
        flash(f"メンバーの削除中にエラーが発生しました: {e}", "error")
    return redirect(url_for('manage_members'))


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
        query = "SELECT s.shift_date AS '日付', m.grade AS '学年', m.name AS 'メンバー名', s.payment_type AS '給与タイプ' FROM shifts s JOIN members m ON s.member_id = m.id ORDER BY s.shift_date ASC, m.grade DESC, m.name ASC;"
        df = pd.read_sql_query(query, db)
        
        shifts_list = []
        if not df.empty:
            df['給与タイプ'] = df['給与タイプ'].replace({'type_1': '1', 'type_V': 'V'})
            shifts_list = df.to_dict(orient='records')
        
        return render_template('schedule.html', shifts=shifts_list)
    except Exception as e:
        flash(f"エラーが発生しました: {e}", "error")
        return render_template('schedule.html', shifts=[])

if __name__ == '__main__':
    app.run(debug=True)
