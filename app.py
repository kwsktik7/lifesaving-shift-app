from flask import Flask, g, redirect, url_for, render_template, request, flash
import sqlite3
import pandas as pd
from algorithm import generate_all_shifts

DB_NAME = 'lifesaving_app.db'
app = Flask(__name__)
# flashメッセージ機能を使うための秘密鍵
app.secret_key = 'your-super-secret-key' 

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

@app.route('/')
def index():
    """トップページ"""
    return render_template('index.html')

@app.route('/submit', methods=['GET', 'POST'])
def submit_availability():
    db = get_db()
    cursor = db.cursor()

    if request.method == 'POST':
        member_id = request.form['member_id']
        shift_date = request.form['shift_date']
        availability_type = request.form['availability_type']
        
        cursor.execute(
            "INSERT OR REPLACE INTO availability (member_id, shift_date, availability_type) VALUES (?, ?, ?)",
            (member_id, shift_date, availability_type)
        )
        db.commit()
        
        # 提出完了メッセージを設定
        flash(f"{shift_date} の希望を提出しました！", "success")
        return redirect(url_for('submit_availability'))

    cursor.execute("SELECT id, name, grade FROM members ORDER BY grade, name")
    members = cursor.fetchall()
    members_list = [{'id': row[0], 'name': row[1], 'grade': row[2]} for row in members]
    
    return render_template('submit_form.html', members=members_list)

@app.route('/schedule')
def schedule():
    """確定シフト表ページ"""
    db = get_db()
    query = "SELECT s.shift_date, m.name, s.payment_type FROM shifts s JOIN members m ON s.member_id = m.id ORDER BY s.shift_date, m.name;"
    df = pd.read_sql_query(query, db)
    # to_htmlでHTMLテーブルに変換
    table_html = df.to_html(classes='striped', index=False, border=0) if not df.empty else "<p>まだシフトが生成されていません。</p>"
    return render_template('schedule.html', table_html=table_html)


@app.route('/run-algorithm')
def run_algorithm_route():
    try:
        generate_all_shifts()
        flash("シフトの自動生成が完了しました！", "success")
    except Exception as e:
        flash(f"シフト生成中にエラーが発生しました: {e}", "error")
    return redirect(url_for('schedule'))

@app.route('/check-availability')
def check_availability():
    """提出された希望シフト一覧ページ"""
    db = get_db()
    query = "SELECT a.shift_date, m.name, a.availability_type FROM availability a JOIN members m ON a.member_id = m.id ORDER BY a.shift_date DESC, m.name;"
    df = pd.read_sql_query(query, db)
    table_html = df.to_html(classes='striped', index=False, border=0) if not df.empty else "<p>まだ希望シフトが提出されていません。</p>"
    return render_template('check_availability.html', table_html=table_html)

# ★★★スケジュールと希望確認用のHTMLファイルも追加★★★

@app.route('/schedule.html')
def schedule_page():
    return render_template('schedule.html')

@app.route('/check_availability.html')
def check_availability_page():
    return render_template('check_availability.html')