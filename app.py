from flask import Flask, g, redirect, url_for, render_template, request, flash
import sqlite3
import pandas as pd
# algorithm.pyからシフト生成関数をインポート
from algorithm import generate_all_shifts

# --- アプリケーションの設定 ---
DB_NAME = 'lifesaving_app.db'
app = Flask(__name__)
# flashメッセージ機能（例：「提出しました！」）を使うには、秘密鍵の設定が必須です
app.secret_key = 'your-super-secret-key-please-change' # 実際にはもっと複雑な文字列に変更してください

# --- データベース接続の管理 ---

def get_db():
    """
    リクエストごとにデータベース接続を管理します。
    接続がなければ新規に作成し、あれば既存の接続を返します。
    """
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DB_NAME)
    return db

@app.teardown_appcontext
def close_connection(exception):
    """
    各リクエストの最後に、データベース接続を自動的に閉じます。
    """
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

# --- 各Webページの処理（ルーティング） ---

@app.route('/')
def index():
    """
    トップページを表示します。
    'templates/index.html' を読み込んで表示します。
    """
    return render_template('index.html')

@app.route('/submit', methods=['GET', 'POST'])
def submit_availability():
    """
    希望シフトの提出フォーム表示（GET）と、データ受信処理（POST）を両方担当します。
    """
    db = get_db()
    cursor = db.cursor()

    if request.method == 'POST':
        # フォームから送信されたデータを取得
        member_id = request.form['member_id']
        shift_date = request.form['shift_date']
        availability_type = request.form['availability_type']
        
        # 同じメンバー・同じ日付のデータがあれば上書き、なければ新規作成するSQL
        cursor.execute(
            "INSERT OR REPLACE INTO availability (member_id, shift_date, availability_type) VALUES (?, ?, ?)",
            (member_id, shift_date, availability_type)
        )
        db.commit()
        
        # 提出完了メッセージを設定
        flash(f"{shift_date} の希望シフト「{request.form.get(availability_type, availability_type)}」を提出しました！", "success")
        # フォームページにリダイレクト
        return redirect(url_for('submit_availability'))

    # GETリクエスト（最初にページを開いた時）の処理
    cursor.execute("SELECT id, name, grade FROM members ORDER BY grade, name")
    members = cursor.fetchall()
    # HTMLで使いやすいように、辞書のリストに変換
    members_list = [{'id': row[0], 'name': row[1], 'grade': row[2]} for row in members]
    
    return render_template('submit_form.html', members=members_list)

@app.route('/schedule')
def schedule():
    """確定したシフト表を表示するページ"""
    db = get_db()
    try:
        # メンバー名も表示するために、shiftsテーブルとmembersテーブルを結合してデータを取得
        query = """
        SELECT
            s.shift_date AS "日付",
            m.name AS "メンバー名",
            s.payment_type AS "給与タイプ"
        FROM
            shifts s
        JOIN
            members m ON s.member_id = m.id
        ORDER BY
            s.shift_date, m.name;
        """
        df = pd.read_sql_query(query, db)

        # テーブルが空でなければ、表示を調整
        if not df.empty:
            # payment_type列の表示を 'type_1' -> '1', 'type_V' -> 'V' に置換
            df['給与タイプ'] = df['給与タイプ'].replace({'type_1': '1', 'type_V': 'V'})
            # DataFrameをHTMLのテーブルに変換
            table_html = df.to_html(classes='striped', index=False, border=0)
        else:
            table_html = "<p>まだシフトが生成されていません。「シフトを自動生成する」ボタンを押してください。</p>"
        
        return render_template('schedule.html', table_html=table_html)
    except Exception as e:
        flash(f"エラーが発生しました: {e}", "error")
        return render_template('schedule.html', table_html="<p>シフト表の表示中にエラーが発生しました。</p>")

@app.route('/run-algorithm')
def run_algorithm_route():
    """シフト生成アルゴリズムを実行する管理者用ページ"""
    try:
        print("シフト生成リクエストを受け取りました。")
        generate_all_shifts() # algorithm.pyのメイン関数を実行
        print("シフト生成が完了しました。")
        flash("シフトの自動生成が完了しました！", "success")
    except Exception as e:
        print(f"シフト生成中にエラーが発生しました: {e}")
        flash(f"シフト生成中にエラーが発生しました: {e}", "error")
    
    # 処理が終わったら、結果表示ページに自動で移動
    return redirect(url_for('schedule'))

@app.route('/check-availability')
def check_availability():
    """提出された希望シフトの一覧を表示するページ"""
    db = get_db()
    try:
        query = """
        SELECT
            a.shift_date AS "日付",
            m.name AS "メンバー名",
            a.availability_type AS "希望"
        FROM
            availability a
        JOIN
            members m ON a.member_id = m.id
        ORDER BY
            a.shift_date DESC, m.name;
        """
        df = pd.read_sql_query(query, db)

        if not df.empty:
            # availability_type列の表示を日本語に置換
            df['希望'] = df['希望'].replace({
                'full_day': '1日入れる',
                'am_only': '午前のみ',
                'pm_only': '午後のみ',
                'unavailable': '入れない'
            })
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
