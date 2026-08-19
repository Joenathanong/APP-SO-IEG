'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Warehouse, Package, Truck, History, Users, Database, X, TableProperties, Boxes, CalendarClock, FileSpreadsheet, Inbox } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/stock-opname/gudang-besar', label: 'Gudang Besar', icon: Warehouse },
  { href: '/stock-opname/gudang-kecil', label: 'Gudang Kecil', icon: Package },
  { href: '/stock-opname/gudang-transit', label: 'Gudang Transit', icon: Truck },
  { href: '/history', label: 'History', icon: History },
  { href: '/data-so', label: 'Data Hasil SO', icon: TableProperties },
  { href: '/bin-status', label: 'Status Bin', icon: Boxes },
  { href: '/antrean', label: 'Antrean Pending', icon: Inbox },
];

const adminItems = [
  { href: '/admin/sessions', label: 'Sesi Opname', icon: CalendarClock },
  { href: '/admin/materials', label: 'Master Material', icon: Boxes },
  { href: '/admin/book-stock', label: 'Saldo Buku (OCS)', icon: FileSpreadsheet },
  { href: '/admin/users', label: 'User Management', icon: Users },
  { href: '/admin/master-bin', label: 'Master Data Bin', icon: Database },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <span className="font-bold text-blue-600 dark:text-blue-400">Menu Navigasi</span>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === href
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </div>

        {user?.role === 'administrator' && (
          <div className="mt-4">
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Admin
            </p>
            <div className="space-y-1">
              {adminItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === href
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-400 text-center">v1.0.0 © 2026 IEG</p>
      </div>
    </div>
  );
}
