import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

export function formatDate(date: string): string {
  return format(parseISO(date), 'M/d(E)', { locale: ja });
}

export function formatDateLong(date: string): string {
  return format(parseISO(date), 'yyyy年M月d日(E)', { locale: ja });
}

export function formatMonth(yearMonth: string): string {
  return format(parseISO(yearMonth + '-01'), 'yyyy年M月', { locale: ja });
}

export function getDayOfWeek(date: string): string {
  return format(parseISO(date), 'E', { locale: ja });
}

export function isWeekend(date: string): boolean {
  const d = parseISO(date);
  const day = d.getDay();
  return day === 0 || day === 6;
}
