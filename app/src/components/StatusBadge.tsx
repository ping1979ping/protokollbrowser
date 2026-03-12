import { STATUS_MAP } from '../types';

export default function StatusBadge({ status }: { status: number }) {
  const info = STATUS_MAP[status] ?? { label: `Status ${status}`, css: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${info.css}`}>
      {info.label}
    </span>
  );
}
