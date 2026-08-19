'use client';
import { useEffect, useState } from 'react';
import { Menu, LogOut, Sun, Moon, WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { formatCountdown } from '@/lib/utils';
import { useShift } from '@/contexts/ShiftContext';

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { shift } = useShift();
  const { isOnline, queueCount, isSyncing, lastError, stuckCount, syncQueue } = useOfflineQueue();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const updateTimer = () => {
      const session = localStorage.getItem('so_session');
      if (session) {
        const { expiresAt } = JSON.parse(session);
        const remaining = expiresAt - Date.now();
        setTimeRemaining(Math.max(0, remaining));
        if (remaining <= 0) logout();
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [logout]);

  const timerColor =
    timeRemaining > 20 * 60 * 1000
      ? 'text-green-600 dark:text-green-400'
      : timeRemaining > 10 * 60 * 1000
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-red-600 dark:text-red-400 animate-pulse';

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-4 shadow-sm flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">SO</span>
          </div>
          <span className="hidden sm:block font-bold text-gray-900 dark:text-white">
            Stock Opname IEG
          </span>
        </div>
        {shift && (
          <span className="hidden md:block text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full font-medium">
            {shift === 'Non-Shift' ? 'Non-Shift' : `Shift ${shift}`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Offline indicator */}
        {!isOnline && (
          <div className="flex items-center gap-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1 rounded-lg text-xs font-medium">
            <WifiOff size={12} />
            <span className="hidden sm:inline">Offline</span>
            {queueCount > 0 && (
              <span className="bg-red-600 text-white rounded-full px-1.5 py-0.5 text-xs">
                {queueCount}
              </span>
            )}
          </div>
        )}
        {isOnline && queueCount > 0 && (
          // Bisa DIKLIK. Sebelumnya ini hanya indikator pasif dan sync cuma
          // dipicu event 'online', sehingga antrean bisa mengendap tanpa ada
          // satu pun cara bagi operator untuk mendorongnya.
          <button
            onClick={() => void syncQueue(true)}
            disabled={isSyncing}
            title={
              lastError
                ? `Sebab kegagalan terakhir: ${lastError}\n\nKetuk untuk mencoba kirim lagi.`
                : 'Kirim antrean sekarang'
            }
            className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-1 rounded-lg text-xs font-medium hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors disabled:opacity-60"
          >
            {isSyncing
              ? <RefreshCw size={12} className="animate-spin" />
              : <Wifi size={12} />}
            <span className="hidden sm:inline">
              {isSyncing ? 'Mengirim...' : `Antrean: ${queueCount}`}
            </span>
            <span className="sm:hidden bg-yellow-600 text-white rounded-full px-1.5 py-0.5">
              {queueCount}
            </span>
          </button>
        )}

        {/* Session timer */}
        {mounted && timeRemaining > 0 && (
          <div className={`flex items-center gap-1 text-xs font-mono font-semibold ${timerColor}`}>
            <span className="hidden sm:inline">Sesi:</span>
            <span>{formatCountdown(timeRemaining)}</span>
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Toggle theme"
        >
          {mounted && theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* User info */}
        {user && (
          <span className="hidden md:block text-sm text-gray-600 dark:text-gray-400 max-w-32 truncate">
            {user.name}
          </span>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          <LogOut size={15} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
