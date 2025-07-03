from flask import Flask, g, redirect, url_for, render_template, request, flash
import sqlite3
import pandas as pd
from datetime import date, timedelta
import random
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
        db.row_factory = sqlite3.Row # 列名でアクセスできるようにする
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

# --- メンバー関連ページ ---

@app.route('/')
def login_page():
    """アプリの入り口となる、ログイン/新規登録ページを表示します。"""
    cursor = get_db().cursor()
    cursor.execute("SELECT id, name, grade, position FROM members WHERE is_active = 1 ORDER BY grade, name")
    members = cursor.fetchall()
    return render_template('login.html', members=members)

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
    position = request.form.get('position')
    
    if not name or not grade or not position:
        flash("名前、学年、役職を全て入力してください。", "error")
        return redirect(url_for('login_page'))

    db = get_db()
    cursor = db.cursor()
    
    cursor.execute("SELECT id FROM members WHERE name = ? AND is_active = 1", (name,))
    if cursor.fetchone():
        flash(f"エラー: 「{name}」は既に登録されています。一覧から選択してください。", "error")
        return redirect(url_for('login_page'))
    
    cursor.execute("INSERT INTO members (name, grade, position, is_active) VALUES (?, ?, ?, ?)", (name, grade, position, 1))
    new_member_id = cursor.lastrowid
    db.commit()
    
    flash(f"ようこそ、{name}さん！メンバーとして登録しました。", "success")
    return redirect(url_for('submit_availability', member_id=new_member_id))


@app.route('/submit/<int:member_id>', methods=['GET', 'POST'])
def submit_availability(member_id):
    """希望シフトの一括提出ページ"""
    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT name, grade, position FROM members WHERE id = ? AND is_active = 1", (member_id,))
    member_info = cursor.fetchone()
    if not member_info:
        flash("指定されたメンバーが見つかりません。ログインからやり直してください。", "error")
        return redirect(url_for('login_page'))
    
    selected_member_name = member_info['name']

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
            cursor.executemany("INSERT OR REPLACE INTO availability (member_id, shift_date, availability_type) VALUES (?, ?, ?)", availability_data_to_save)
            db.commit()
        except Exception as e:
            db.rollback()
            flash(f"データベースの更新中にエラーが発生しました: {e}", "error")
            return redirect(url_for('submit_availability', member_id=member_id))
        return redirect(url_for('success_page'))

    days = []
    weekdays_jp = ["月", "火", "水", "木", "金", "土", "日"]
    current_date = START_DATE
    while current_date <= END_DATE:
        days.append({'date': current_date, 'weekday': weekdays_jp[current_date.weekday()]})
        current_date += timedelta(days=1)
    
    availability = {}
    cursor.execute("SELECT shift_date, availability_type FROM availability WHERE member_id = ?", (member_id,))
    for row in cursor.fetchall():
        availability[row['shift_date']] = row['availability_type']
            
    return render_template('submit_form.html', 
                           selected_member_id=member_id,
                           selected_member_name=selected_member_name,
                           days=days, 
                           availability=availability)

@app.route('/success')
def success_page():
    """提出完了ページ"""
    return render_template('submit_success.html')

# --- 管理者向けページ ---

@app.route('/admin')
def admin_dashboard():
    """管理者用のダッシュボードページ"""
    return render_template('admin_dashboard.html')

@app.route('/manage-members')
def manage_members():
    """メンバーの一覧表示と削除を行う管理者ページ"""
    cursor = get_db().cursor()
    cursor.execute("SELECT id, name, grade, position FROM members WHERE is_active = 1 ORDER BY grade DESC, name ASC")
    members = cursor.fetchall()
    return render_template('manage_members.html', members=members)

@app.route('/delete-member/<int:member_id>', methods=['POST'])
def delete_member(member_id):
    """メンバーをデータベースから完全に削除する"""
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute("DELETE FROM members WHERE id = ?", (member_id,))
        db.commit()
        flash("メンバーを完全に削除しました。", "success")
    except Exception as e:
        db.rollback()
        flash(f"メンバーの削除中にエラーが発生しました: {e}", "error")
    return redirect(url_for('manage_members'))


@app.route('/run-algorithm')
def run_algorithm_route():
    """シフト生成アルゴリズムを実行"""
    try:
        generate_all_shifts()
        flash("シフトの自動生成が完了しました！", "success")
    except Exception as e:
        flash(f"シフト生成中にエラーが発生しました: {e}", "error")
    return redirect(url_for('schedule'))

@app.route('/schedule')
def schedule():
    """確定シフト表ページ"""
    db = get_db()
    try:
        query = "SELECT s.shift_date, m.grade, m.position, m.name, s.payment_type, a.availability_type FROM shifts s JOIN members m ON s.member_id = m.id LEFT JOIN availability a ON s.member_id = a.member_id AND s.shift_date = a.shift_date ORDER BY s.shift_date ASC, m.grade DESC, m.position ASC, m.name ASC;"
        df = pd.read_sql_query(query, db)
        shifts_list = []
        if not df.empty:
            def format_display_name(row):
                if row['availability_type'] == 'am_only': return f"{row['name']} (AM)"
                if row['availability_type'] == 'pm_only': return f"{row['name']} (PM)"
                return row['name']
            df['display_name'] = df.apply(format_display_name, axis=1)
            df['payment_type'] = df['payment_type'].replace({'type_1': '1', 'type_V': 'V'})
            shifts_list = df.to_dict(orient='records')
        return render_template('schedule.html', shifts=shifts_list)
    except Exception as e:
        flash(f"エラーが発生しました: {e}", "error")
        return render_template('schedule.html', shifts=[])

@app.route('/edit-schedule/<shift_date>')
def edit_daily_shift(shift_date):
    """特定の日付のシフトを編集するページ"""
    cursor = get_db().cursor()
    cursor.execute("SELECT m.id, m.name, m.grade, m.position, a.availability_type FROM members m JOIN shifts s ON m.id = s.member_id LEFT JOIN availability a ON m.id = a.member_id AND s.shift_date = a.shift_date WHERE s.shift_date = ? ORDER BY m.grade DESC, m.name ASC", (shift_date,))
    assigned_members_raw = cursor.fetchall()
    cursor.execute("SELECT m.id, m.name, m.grade, m.position, a.availability_type FROM members m JOIN availability a ON m.id = a.member_id WHERE a.shift_date = ? AND a.availability_type IN ('full_day', 'am_only', 'pm_only') AND m.is_active = 1 ORDER BY m.grade DESC, m.name ASC", (shift_date,))
    all_available_members_raw = cursor.fetchall()
    
    def format_member_list(member_list):
        formatted_list = []
        for member in member_list:
            display_name = f"{member['name']} ({member['grade']}年 / {member['position']})"
            if member['availability_type'] == 'am_only': display_name += " (AM)"
            elif member['availability_type'] == 'pm_only': display_name += " (PM)"
            formatted_list.append({'id': member['id'], 'display_name': display_name})
        return formatted_list

    assigned_members = format_member_list(assigned_members_raw)
    all_available_members = format_member_list(all_available_members_raw)
    
    assigned_ids = {m['id'] for m in assigned_members}
    available_members = [m for m in all_available_members if m['id'] not in assigned_ids]

    return render_template('edit_schedule.html', shift_date=shift_date, assigned_members=assigned_members, available_members=available_members)

@app.route('/add-to-shift/<shift_date>/<int:member_id>', methods=['POST'])
def add_to_shift(shift_date, member_id):
    """メンバーをシフトに追加する"""
    db = get_db()
    pay_type = random.choice(['type_1', 'type_V'])
    db.execute("INSERT INTO shifts (shift_date, member_id, shift_type, payment_type) VALUES (?, ?, ?, ?)", (shift_date, member_id, 'full_day', pay_type))
    db.commit()
    return redirect(url_for('edit_daily_shift', shift_date=shift_date))

@app.route('/remove-from-shift/<shift_date>/<int:member_id>', methods=['POST'])
def remove_from_shift(shift_date, member_id):
    """メンバーをシフトから削除する"""
    db = get_db()
    db.execute("DELETE FROM shifts WHERE shift_date = ? AND member_id = ?", (shift_date, member_id))
    db.commit()
    return redirect(url_for('edit_daily_shift', shift_date=shift_date))

@app.route('/summary')
def summary_page():
    """メンバーごとの勤務日数を集計して表示する事務ページ"""
    db = get_db()
    try:
        query = "SELECT m.name, m.position, s.total_days, s.type_1_days, s.type_v_days, s.v_ratio FROM shift_summary s JOIN members m ON s.member_id = m.id ORDER BY s.total_days DESC, m.name ASC;"
        summary_data = db.execute(query).fetchall()
        return render_template('summary.html', summary_data=summary_data)
    except sqlite3.OperationalError:
        flash("集計データがありません。まず「シフトを自動生成する」を実行してください。", "warning")
        return render_template('summary.html', summary_data=[])
    except Exception as e:
        flash(f"レポートの表示中にエラーが発生しました: {e}", "error")
        return render_template('summary.html', summary_data=[])

if __name__ == '__main__':
    app.run(debug=True)
