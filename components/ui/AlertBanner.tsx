import { ReactNode } from 'react';
import { Icon, toneIcons } from '@/components/ui/icons';

type AlertVariant = 'info' | 'warning' | 'danger' | 'success';

interface AlertBannerProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
}

const variantConfig: Record<AlertVariant, { bg: string; border: string; iconColor: string }> = {
  info: { bg: 'bg-blue-50', border: 'border-blue-200', iconColor: 'text-blue-800' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', iconColor: 'text-amber-800' },
  danger: { bg: 'bg-red-50', border: 'border-red-200', iconColor: 'text-red-800' },
  success: { bg: 'bg-green-50', border: 'border-green-200', iconColor: 'text-green-800' },
};

export default function AlertBanner({ variant = 'info', title, children }: AlertBannerProps) {
  const config = variantConfig[variant];
  return (
    <div className={`rounded-xl border px-4 py-3 ${config.bg} ${config.border}`}>
      <div className="flex items-start gap-2">
        <Icon icon={toneIcons[variant]} className={`mt-0.5 size-5 shrink-0 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          {title && <p className="font-semibold text-sm mb-0.5">{title}</p>}
          <div className="text-sm text-gray-700">{children}</div>
        </div>
      </div>
    </div>
  );
}
