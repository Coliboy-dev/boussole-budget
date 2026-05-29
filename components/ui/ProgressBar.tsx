interface ProgressBarProps {
  value: number; // 0-100
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'accent';
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

const colorClasses: Record<string, string> = {
  primary: 'bg-teal-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  accent: 'bg-indigo-500',
};

const bgClasses: Record<string, string> = {
  primary: 'bg-teal-100',
  success: 'bg-green-100',
  warning: 'bg-amber-100',
  danger: 'bg-red-100',
  accent: 'bg-indigo-100',
};

export default function ProgressBar({
  value,
  color = 'primary',
  size = 'md',
  showLabel = false,
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const sizeClasses = size === 'sm' ? 'h-1.5' : 'h-2.5';

  return (
    <div className="w-full">
      <div className={`w-full rounded-full overflow-hidden ${bgClasses[color]} ${sizeClasses}`}>
        <div
          className={`${sizeClasses} rounded-full transition-all duration-500 ${colorClasses[color]}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-gray-500 mt-1 text-right">{Math.round(clampedValue)}%</p>
      )}
    </div>
  );
}
