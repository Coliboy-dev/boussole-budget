import Link from 'next/link';

interface SectionLink {
  href: string;
  label: string;
}

export default function SectionLinks({ links }: { links: SectionLink[] }) {
  return (
    <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
      {links.map(({ href, label }) => (
        <li key={href}>
          <Link href={href} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50">
            {label}
            <span aria-hidden="true">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
