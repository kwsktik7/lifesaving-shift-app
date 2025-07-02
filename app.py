# ★★★新しいインポートを追加★★★
from flask import Flask, g, redirect, url_for
import sqlite3
import pandas as pd
# ★★★algorithm.pyの関数をインポート★★★
from algorithm import generate_all_shifts

DB_NAME = 'lifesaving_app.db'
app = Flask(__name__)

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
    # ★★★実行ボタンへのリンクを追加★★★
    return '''
    <h1>ライフセービング シフト管理アプリ</h1>
    <p><a href="/schedule">完成したシフト表を見る</a></p>
    <hr>
    <h2>管理者メニュー</h2>
    <p><a href="/run-algorithm">シフトを自動生成する</a></p>
    <p style="color:red;">（注意：現在のシフトは上書きされます）</p>
    '''

@app.route('/schedule')
def schedule():
    try:
        query = """
        SELECT s.shift_date, m.name, s.payment_type FROM shifts s
        JOIN members m ON s.member_id = m.id ORDER BY s.shift_date, m.name;
        """
        df = pd.read_sql_query(query, get_db())
        html_table = df.to_html(classes='table table-striped', index=False, border=1)
        return f'<h1>確定シフト表</h1>{html_table}<br><a href="/">トップに戻る</a>'
    except Exception as e:
        return f"エラーが発生しました: {e}<br>（シフトがまだ生成されていない可能性があります）"

# ★★★シフト実行のための新しいページを追加★★★
@app.route('/run-algorithm')
def run_algorithm_route():
    print("シフト生成リクエストを受け取りました。")
    # algorithm.pyのメイン関数を呼び出す
    generate_all_shifts()
    print("シフト生成が完了しました。結果ページにリダイレクトします。")
    # 処理が終わったら、結果表示ページに自動で移動（リダイレクト）させる
    return redirect(url_for('schedule'))

if __name__ == '__main__':
    app.run(debug=True)

# テスト用のコメント
