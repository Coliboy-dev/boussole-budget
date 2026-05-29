import { ReactNode } from 'react';

type AlertVariant = 'info' | 'warning' | 'danger' | 'success';

interface AlertBannerProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
}

const variantConfig: Record<AlertVariant, { bg: string; border: string; icon: string }> = {
  info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'ℹ️' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: '⚠️' },
  danger: { bg: 'bg-red-50', border: 'border-red-200', icon: '🚨' },
  success: { bg: 'bg-green-50', border: 'border-green-200', icon: '✅' },
};

export default function AlertBanner({ variant = 'info', title, children }: AlertBannerProps) {
  const config = variantConfig[variant];
  return (
    <div className={`rounded-xl border px-4 py-3 ${config.bg} ${config.border}`}>
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5">{config.icon}</span>
        <div className="flex-1 min-w-0">
          {title && <p className="font-semibold text-sm mb-0.5">{title}</p>}
          <div className="text-sm text-gray-700">{children}</div>
        </div>
      </div>
    </div>
  );
}
