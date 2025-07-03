import sqlite3
import pandas as pd
import random
from datetime import date, timedelta
import jpholiday

# --- アプリケーションの基本設定 ---
DB_NAME = 'lifesaving_app.db'
START_DATE = date(2025, 6, 27)
END_DATE = date(2025, 8, 31)

STAFF_REQUIREMENTS = {
    'weekday': {'min': 8, 'max': 13},
    'holiday': {'min': 23, 'max': 30}
}
PAYMENT_RATIO = {
    'type_1': 0.8,
    'type_V': 0.2
}

# --- データ読み込み関数 ---
def get_dataframes():
    with sqlite3.connect(DB_NAME) as connection:
        members_df = pd.read_sql_query("SELECT * FROM members WHERE is_active = 1", connection)
        availability_df = pd.read_sql_query("SELECT * FROM availability", connection)
    return members_df, availability_df

def get_available_members_for_date(target_date_str, availability_df):
    workable_types = ['full_day', 'am_only', 'pm_only']
    date_specific_availability = availability_df[availability_df['shift_date'] == target_date_str]
    available_members = date_specific_availability[
        date_specific_availability['availability_type'].isin(workable_types)
    ]
    return available_members['member_id'].tolist()


# --- ★★★ シフト割り当ての中核関数を大改造 ★★★ ---
def create_fair_daily_shift(target_date, available_members, shift_counts, members_df):
    """
    公平性（勤務日数＋学年バランス）を考慮して、その日のシフトを決定します。
    """
    is_holiday = target_date.weekday() >= 5 or jpholiday.is_holiday(target_date)
    req_range = STAFF_REQUIREMENTS['holiday' if is_holiday else 'weekday']
    required_staff = random.randint(req_range['min'], req_range['max'])

    # メンバーIDと学年を紐付ける辞書を作成
    member_id_to_grade = pd.Series(members_df.grade.values, index=members_df.id).to_dict()
    
    # その日のシフトに入るメンバーを一人ずつ選んでいく
    assigned_members = []
    # その日のシフト内の学年構成をカウントする
    daily_grade_counts = {1: 0, 2: 0, 3: 0, 4: 0}
    
    # 採用可能なメンバーリスト（まだ採用されていない人）
    remaining_available = [mid for mid in available_members if mid in shift_counts]

    for _ in range(required_staff):
        if not remaining_available:
            break # 採用できる人がもういない場合はループを抜ける

        # 候補者全員の「評価スコア」を計算する
        # スコアが低い人ほど優先される
        candidate_scores = []
        for member_id in remaining_available:
            total_shifts = shift_counts[member_id]
            grade = member_id_to_grade.get(member_id, 0)
            current_grade_count = daily_grade_counts.get(grade, 0)
            
            # 評価スコア = (合計勤務日数, この学年の今日の人数)
            # このスコアが最も低い人を採用する
            score = (total_shifts, current_grade_count)
            candidate_scores.append((score, member_id))
        
        # 最もスコアが低い候補者を選ぶ
        candidate_scores.sort(key=lambda x: x[0])
        best_candidate_id = candidate_scores[0][1]
        
        # 採用リストに追加
        assigned_members.append(best_candidate_id)
        # 採用した人の学年をカウントアップ
        best_candidate_grade = member_id_to_grade.get(best_candidate_id, 0)
        if best_candidate_grade in daily_grade_counts:
            daily_grade_counts[best_candidate_grade] += 1
        
        # 採用可能なリストから削除
        remaining_available.remove(best_candidate_id)

    # 最終的に採用された全員の合計勤務日数をカウントアップ
    for member_id in assigned_members:
        shift_counts[member_id] += 1
        
    return assigned_members, shift_counts


# --- ★★★ メイン関数を修正 ★★★ ---
def generate_all_shifts():
    """
    全てのシフト生成ロジックを実行し、結果をデータベースに保存します。
    """
    print("--- 1. データの読み込みを開始 ---")
    members_df, availability_df = get_dataframes()
    
    if members_df.empty:
        print("メンバーが登録されていないため、シフトを生成できません。")
        return

    shift_counts = {member_id: 0 for member_id in members_df['id']}
    final_shifts = {}
    
    print("--- 2. 公平なシフト割り当てを開始 ---")
    current_date = START_DATE
    while current_date <= END_DATE:
        date_str = current_date.strftime('%Y-%m-%d')
        available_list = get_available_members_for_date(date_str, availability_df)
        
        # members_dfを渡すように変更
        assigned_list, shift_counts = create_fair_daily_shift(current_date, available_list, shift_counts, members_df)
        
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
        
        k = min(num_type_1, len(work_dates))
        type_1_dates = random.sample(work_dates, k=k)
        
        for d in work_dates:
            pay_type = 'type_1' if d in type_1_dates else 'type_V'
            final_shift_details.append({
                'member_id': member_id, 'date': d, 'shift_type': 'full_day', 'pay_type': pay_type
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

# このファイルが直接実行された時だけ、テストコードが動きます。
if __name__ == '__main__':
    print("アルゴリズムの単体テストを実行します...")
    generate_all_shifts()
    
    db = sqlite3.connect(DB_NAME)
    df = pd.read_sql_query("SELECT * FROM shifts", db)
    print("\n【生成されたシフト（先頭10件）】")
    print(df.head(10))
    db.close()
