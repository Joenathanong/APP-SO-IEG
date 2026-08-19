'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useShift } from '@/contexts/ShiftContext';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ShiftType } from '@/types';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { shift, setShift } = useShift();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState<ShiftType>('1');

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (!shift) {
        setShowShiftModal(true);
      }
    }
  }, [user, loading, shift, router]);

  const handleSaveShift = () => {
    setShift(selectedShift);
    setShowShiftModal(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <TopBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* Shift Modal */}
      <Modal
        isOpen={showShiftModal}
        title="Pilih Shift Kerja"
        onClose={() => {}}
        hideClose={true}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Pilih shift untuk sesi Stock Opname ini. Shift hanya dipilih sekali per sesi login.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {(['1', '2', '3', 'Non-Shift'] as ShiftType[]).map((s) => (
            <button
              key={s}
              onClick={() => setSelectedShift(s)}
              className={`p-3 rounded-lg border-2 font-medium transition-all ${
                selectedShift === s
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 text-gray-700 dark:text-gray-300'
              }`}
            >
              {s === 'Non-Shift' ? 'Non-Shift' : `Shift ${s}`}
            </button>
          ))}
        </div>
        <Button onClick={handleSaveShift} className="w-full">
          Konfirmasi Shift
        </Button>
      </Modal>
    </div>
  );
}
