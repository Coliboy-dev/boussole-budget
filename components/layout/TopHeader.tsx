interface TopHeaderProps {
  greeting?: string;
  subtitle?: string;
}

export default function TopHeader({ greeting, subtitle }: TopHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🧭</span>
            <span className="font-bold text-teal-700 text-lg tracking-tight">Boussole Budget</span>
          </div>
          {(greeting || subtitle) && (
            <p className="text-xs text-gray-500 mt-0.5">
              {greeting || subtitle}
            </p>
          )}
        </div>
        <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm">
          S
        </div>
      </div>
    </header>
  );
}
