import sqlite3
import pandas as pd
import random
from datetime import date, timedelta
import jpholiday

# --- 設定（変更なし） ---
DB_NAME = 'lifesaving_app.db'
START_DATE = date(2025, 6, 27)
END_DATE = date(2025, 8, 31)
STAFF_REQUIREMENTS = {
    'weekday': {'min': 8, 'max': 13},
    'holiday': {'min': 23, 'max': 30}
}
PAYMENT_RATIO = {'type_1': 0.8, 'type_V': 0.2}

# --- 関数群（変更なし） ---
def get_dataframes():
    with sqlite3.connect(DB_NAME) as connection:
        members_df = pd.read_sql_query("SELECT * FROM members", connection)
        availability_df = pd.read_sql_query("SELECT * FROM availability", connection)
    return members_df, availability_df

def get_available_members_for_date(target_date_str, availability_df):
    workable_types = ['full_day', 'am_only', 'pm_only']
    date_specific_availability = availability_df[availability_df['shift_date'] == target_date_str]
    available_members = date_specific_availability[
        date_specific_availability['availability_type'].isin(workable_types)
    ]
    return available_members['member_id'].tolist()

def create_fair_daily_shift(target_date, available_members, shift_counts):
    is_holiday = target_date.weekday() >= 5 or jpholiday.is_holiday(target_date)
    req_range = STAFF_REQUIREMENTS['holiday' if is_holiday else 'weekday']
    required_staff = random.randint(req_range['min'], req_range['max'])
    available_members.sort(key=lambda m: shift_counts[m])
    assigned_members = available_members[:required_staff]
    for member_id in assigned_members:
        shift_counts[member_id] += 1
    return assigned_members, shift_counts

# --- ★★★ここからが新しい部分★★★ ---

def generate_all_shifts():
    """全てのシフト生成ロジックを実行するメイン関数"""
    members_df, availability_df = get_dataframes()
    shift_counts = {member_id: 0 for member_id in members_df['id']}
    final_shifts = {}
    
    current_date = START_DATE
    while current_date <= END_DATE:
        available_list = get_available_members_for_date(current_date.strftime('%Y-%m-%d'), availability_df)
        assigned_list, shift_counts = create_fair_daily_shift(current_date, available_list, shift_counts)
        final_shifts[current_date.strftime('%Y-%m-%d')] = assigned_list
        current_date += timedelta(days=1)
    
    final_shift_details = []
    member_id_to_name = pd.Series(members_df.name.values, index=members_df.id).to_dict()

    for member_id, total_shifts in shift_counts.items():
        if total_shifts == 0: continue
        num_type_1 = round(total_shifts * PAYMENT_RATIO['type_1'])
        work_dates = [d for d, members in final_shifts.items() if member_id in members]
        type_1_dates = random.sample(work_dates, k=num_type_1)
        for d in work_dates:
            pay_type = 'type_1' if d in type_1_dates else 'type_V'
            final_shift_details.append({
                'date': d, 'member_id': member_id, 'member_name': member_id_to_name[member_id], 'pay_type': pay_type
            })

    with sqlite3.connect(DB_NAME) as connection:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM shifts")
        for shift in final_shift_details:
            cursor.execute("INSERT INTO shifts (member_id, shift_date, shift_type, payment_type) VALUES (?, ?, ?, ?)",
                           (shift['member_id'], shift['date'], 'full_day', shift['pay_type']))
        connection.commit()
    
    print("シフト生成とデータベースへの保存が完了しました。")


# このファイルが直接実行された時だけ、この部分が動く（テスト用）
if __name__ == '__main__':
    generate_all_shifts()