import sqlite3
import pandas as pd
import random
from datetime import date, timedelta
import jpholiday

# --- 設定 ---
DB_NAME = 'lifesaving_app.db'
START_DATE = date(2025, 6, 27)
END_DATE = date(2025, 8, 31)

STAFF_REQUIREMENTS = {
    'weekday': {'min': 8, 'max': 13},
    'holiday': {'min': 23, 'max': 30}
}
PAYMENT_RATIO = {
    'type_1': 0.7,
    'type_V': 0.3
}
LEADERSHIP_POSITIONS = ['監視長', '副監視長']

# --- (データ読み込み、シフト割り当て関数は変更なし) ---
def get_dataframes():
    # ...
    with sqlite3.connect(DB_NAME) as connection:
        members_df = pd.read_sql_query("SELECT * FROM members WHERE is_active = 1", connection)
        availability_df = pd.read_sql_query("SELECT * FROM availability", connection)
    return members_df, availability_df

def get_available_members_for_date(target_date_str, availability_df):
    # ...
    workable_types = ['full_day', 'am_only', 'pm_only']
    date_specific_availability = availability_df[availability_df['shift_date'] == target_date_str]
    available_members = date_specific_availability[date_specific_availability['availability_type'].isin(workable_types)]
    return available_members['member_id'].tolist()

def create_fair_daily_shift(target_date, available_member_ids, shift_counts, members_df):
    # ...
    is_holiday = target_date.weekday() >= 5 or jpholiday.is_holiday(target_date)
    req_range = STAFF_REQUIREMENTS['holiday' if is_holiday else 'weekday']
    required_staff = random.randint(req_range['min'], req_range['max'])
    member_id_to_info = members_df.set_index('id').to_dict('index')
    assigned_members = []
    daily_grade_counts = {1: 0, 2: 0, 3: 0, 4: 0}
    remaining_available = [mid for mid in available_member_ids if mid in member_id_to_info]
    leadership_candidates = [mid for mid in remaining_available if member_id_to_info[mid]['position'] in LEADERSHIP_POSITIONS]
    if leadership_candidates:
        leadership_candidates.sort(key=lambda mid: shift_counts[mid])
        leader_id = leadership_candidates[0]
        assigned_members.append(leader_id)
        remaining_available.remove(leader_id)
        leader_grade = member_id_to_info[leader_id]['grade']
        daily_grade_counts[leader_grade] += 1
    else:
        print(f"警告: {target_date} に勤務可能なリーダーがいません。")
    for _ in range(required_staff - len(assigned_members)):
        if not remaining_available: break
        candidate_scores = []
        for member_id in remaining_available:
            score = (shift_counts[member_id], daily_grade_counts.get(member_id_to_info[member_id]['grade'], 0))
            candidate_scores.append((score, member_id))
        candidate_scores.sort(key=lambda x: x[0])
        best_candidate_id = candidate_scores[0][1]
        assigned_members.append(best_candidate_id)
        best_candidate_grade = member_id_to_info[best_candidate_id]['grade']
        daily_grade_counts[best_candidate_grade] += 1
        remaining_available.remove(best_candidate_id)
    for member_id in assigned_members:
        shift_counts[member_id] += 1
    return assigned_members, shift_counts

# ★★★ メイン関数に集計処理を追加 ★★★
def generate_all_shifts():
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
        assigned_list, shift_counts = create_fair_daily_shift(current_date, available_list, shift_counts, members_df)
        final_shifts[date_str] = assigned_list
        current_date += timedelta(days=1)
    print("--- 公平なシフト割り当てが完了しました ---")

    print("--- 3. 給与タイプの割り振りを開始 ---")
    final_shift_details = []
    for member_id, total_shifts in shift_counts.items():
        if total_shifts == 0: continue
        num_type_1 = round(total_shifts * PAYMENT_RATIO['type_1'])
        work_dates = [d for d, members in final_shifts.items() if member_id in members]
        k = min(num_type_1, len(work_dates))
        type_1_dates = random.sample(work_dates, k=k)
        for d in work_dates:
            pay_type = 'type_1' if d in type_1_dates else 'type_V'
            final_shift_details.append({'member_id': member_id, 'date': d, 'shift_type': 'full_day', 'pay_type': pay_type})
    print("--- 給与タイプの割り振りが完了しました ---")

    with sqlite3.connect(DB_NAME) as connection:
        cursor = connection.cursor()
        print("--- 4. 最終シフトをデータベースに保存 ---")
        cursor.execute("DELETE FROM shifts")
        insert_data = [(s['member_id'], s['date'], s['shift_type'], s['pay_type']) for s in final_shift_details]
        cursor.executemany("INSERT INTO shifts (member_id, shift_date, shift_type, payment_type) VALUES (?, ?, ?, ?)", insert_data)
        
        # ★★★ 5. 勤務日数の集計と保存 ★★★
        print("--- 5. 勤務日数の集計を開始 ---")
        if final_shift_details:
            shifts_df = pd.DataFrame(final_shift_details)
            summary = shifts_df.groupby('member_id')['pay_type'].value_counts().unstack(fill_value=0)
            summary['total_days'] = summary.sum(axis=1)
            summary = summary.rename(columns={'type_1': 'type_1_days', 'type_V': 'type_v_days'})
            # Vの割合を計算（0除算を回避）
            summary['v_ratio'] = (summary['type_v_days'] / summary['total_days'] * 100).where(summary['total_days'] > 0, 0)
            
            # データベースに保存する形式に変換
            summary_data_to_save = []
            for member_id, row in summary.iterrows():
                summary_data_to_save.append((
                    int(member_id),
                    int(row.get('total_days', 0)),
                    int(row.get('type_1_days', 0)),
                    int(row.get('type_v_days', 0)),
                    float(row.get('v_ratio', 0))
                ))
            
            cursor.execute("DELETE FROM shift_summary")
            cursor.executemany("INSERT INTO shift_summary (member_id, total_days, type_1_days, type_v_days, v_ratio) VALUES (?, ?, ?, ?, ?)", summary_data_to_save)
            print("--- 集計データの保存が完了しました ---")

        connection.commit()
    print("--- 全ての処理が完了しました ---")

if __name__ == '__main__':
    generate_all_shifts()
