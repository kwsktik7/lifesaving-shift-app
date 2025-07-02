import sqlite3
import pandas as pd
import random
from datetime import date, timedelta
import jpholiday # 日本の祝日を判定するためのライブラリ

# --- アプリケーションの基本設定 ---
# このセクションの値を変更することで、アプリの挙動を調整できます。

# データベースファイル名
DB_NAME = 'lifesaving_app.db'

# シフト作成の対象期間
START_DATE = date(2025, 6, 27)
END_DATE = date(2025, 8, 31)

# 日ごとの必要人数の範囲
STAFF_REQUIREMENTS = {
    'weekday': {'min': 8, 'max': 13},  # 平日の必要人数
    'holiday': {'min': 23, 'max': 30}  # 土日祝日の必要人数
}

# 給与タイプの比率（合計で1.0になるように）
PAYMENT_RATIO = {
    'type_1': 0.8, # 8割が高給与
    'type_V': 0.2  # 2割が低給与
}


# --- データ読み込み関数 ---

def get_dataframes():
    """
    データベースからメンバー情報と希望シフト情報を読み込み、
    PandasのDataFrame形式で返します。
    """
    with sqlite3.connect(DB_NAME) as connection:
        # 【バグ修正】必ず有効なメンバー(is_active=1)のみを対象にする
        members_df = pd.read_sql_query("SELECT * FROM members WHERE is_active = 1", connection)
        availability_df = pd.read_sql_query("SELECT * FROM availability", connection)
    return members_df, availability_df

def get_available_members_for_date(target_date_str, availability_df):
    """
    指定された日付に勤務可能なメンバー（「入れない」以外を希望した人）の
    IDリストを返します。
    """
    workable_types = ['full_day', 'am_only', 'pm_only']
    date_specific_availability = availability_df[availability_df['shift_date'] == target_date_str]
    available_members = date_specific_availability[
        date_specific_availability['availability_type'].isin(workable_types)
    ]
    return available_members['member_id'].tolist()


# --- シフト割り当ての中核関数 ---

def create_fair_daily_shift(target_date, available_members, shift_counts):
    """
    公平性を考慮して、その日のシフトを決定します。
    - 勤務日数が少ない人を優先的に選びます。
    - 採用された人の勤務日数をカウントアップします。
    """
    is_holiday = target_date.weekday() >= 5 or jpholiday.is_holiday(target_date)
    req_range = STAFF_REQUIREMENTS['holiday' if is_holiday else 'weekday']
    required_staff = random.randint(req_range['min'], req_range['max'])
    
    # 【バグ修正】希望者リストの中から、現在有効なメンバー（shift_countsにIDが存在する人）だけを対象にする
    valid_available_members = [mid for mid in available_members if mid in shift_counts]
    
    random.shuffle(valid_available_members)
    valid_available_members.sort(key=lambda member_id: shift_counts[member_id])
    
    assigned_members = valid_available_members[:required_staff]
    
    for member_id in assigned_members:
        shift_counts[member_id] += 1
        
    return assigned_members, shift_counts


# --- 全ての処理をまとめるメイン関数 ---

def generate_all_shifts():
    """
    全てのシフト生成ロジックを実行し、結果をデータベースに保存します。
    """
    print("--- 1. データの読み込みを開始 ---")
    members_df, availability_df = get_dataframes()
    
    shift_counts = {member_id: 0 for member_id in members_df['id']}
    final_shifts = {}
    
    print("--- 2. 公平なシフト割り当てを開始 ---")
    current_date = START_DATE
    while current_date <= END_DATE:
        date_str = current_date.strftime('%Y-%m-%d')
        available_list = get_available_members_for_date(date_str, availability_df)
        assigned_list, shift_counts = create_fair_daily_shift(current_date, available_list, shift_counts)
        final_shifts[date_str] = assigned_list
        current_date += timedelta(days=1)
    print("--- 公平なシフト割り当てが完了しました ---")

    print("--- 3. 給与タイプの割り振りを開始 ---")
    final_shift_details = []

    for member_id, total_shifts in shift_counts.items():
        if total_shifts == 0:
            continue
            
        num_type_1 = round(total_shifts * PAYMENT_RATIO['type_1'])
        work_dates = [d for d, members in final_shifts.items() if member_id in members]
        
        # 勤務日数が足りない場合、サンプル数は勤務日数に合わせる
        k = min(num_type_1, len(work_dates))
        type_1_dates = random.sample(work_dates, k=k)
        
        for d in work_dates:
            pay_type = 'type_1' if d in type_1_dates else 'type_V'
            final_shift_details.append({
                'member_id': member_id,
                'date': d,
                'shift_type': 'full_day',
                'pay_type': pay_type
            })
    print("--- 給与タイプの割り振りが完了しました ---")

    print("--- 4. 最終シフトをデータベースに保存 ---")
    with sqlite3.connect(DB_NAME) as connection:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM shifts")
        insert_data = [(s['member_id'], s['date'], s['shift_type'], s['pay_type']) for s in final_shift_details]
        cursor.executemany("INSERT INTO shifts (member_id, shift_date, shift_type, payment_type) VALUES (?, ?, ?, ?)", insert_data)
        connection.commit()
    print("--- 全ての処理が完了しました ---")


# このファイルがターミナルから `python algorithm.py` で直接実行された場合のみ、テストコードが動きます。
if __name__ == '__main__':
    print("アルゴリズムの単体テストを実行します...")
    generate_all_shifts()
    
    # 結果の確認
    db = sqlite3.connect(DB_NAME)
    df = pd.read_sql_query("SELECT * FROM shifts", db)
    print("\n【生成されたシフト（先頭10件）】")
    print(df.head(10))
    db.close()
