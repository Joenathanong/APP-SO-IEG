'use client';
import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { AppUser, UserRole } from '@/types';
import { Users, Plus, Edit2, AlertTriangle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { showSuccess, showError } = useToast();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Add form
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState<UserRole>('operator');
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});

  // Edit form
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('operator');
  const [editActive, setEditActive] = useState(true);
  const [selfDeactivateWarning, setSelfDeactivateWarning] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/firebase/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch {
      showError('Gagal memuat data user.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role !== 'administrator') return;
    fetchUsers();
  }, []);

  const handleOpenEdit = (u: AppUser) => {
    setEditUser(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditActive(u.active);
    setSelfDeactivateWarning(false);
    setShowEditModal(true);
  };

  const handleAdd = async () => {
    const errors: Record<string, string> = {};
    if (!addName.trim()) errors.name = 'Nama wajib diisi.';
    if (!addEmail.trim()) errors.email = 'Email wajib diisi.';
    if (!addPassword || addPassword.length < 6) errors.password = 'Password minimal 6 karakter.';
    if (Object.keys(errors).length > 0) {
      setAddErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/firebase/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName, email: addEmail, password: addPassword, role: addRole }),
      });
      if (res.ok) {
        showSuccess('User berhasil ditambahkan!');
        setShowAddModal(false);
        setAddName(''); setAddEmail(''); setAddPassword(''); setAddRole('operator'); setAddErrors({});
        fetchUsers();
      } else {
        const data = await res.json();
        showError('Gagal menambahkan user.', data.error);
      }
    } catch {
      showError('Gagal menambahkan user.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    if (!editActive && editUser.uid === currentUser?.uid) {
      setSelfDeactivateWarning(true);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/firebase/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: editUser.uid, name: editName, role: editRole, active: editActive }),
      });
      if (res.ok) {
        showSuccess('User berhasil diupdate!');
        setShowEditModal(false);
        setEditUser(null);
        fetchUsers();
      } else {
        const data = await res.json();
        showError('Gagal mengupdate user.', data.error);
      }
    } catch {
      showError('Gagal mengupdate user.');
    } finally {
      setIsSaving(false);
    }
  };

  if (currentUser?.role !== 'administrator') {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-gray-500">
          Akses ditolak. Halaman ini hanya untuk Administrator.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users size={24} className="text-blue-600" />
              User Management
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{users.length} user terdaftar</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchUsers} variant="outline" size="sm" loading={loading}>
              <RefreshCw size={14} />
            </Button>
            <Button onClick={() => setShowAddModal(true)} size="sm">
              <Plus size={15} />
              Tambah User
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-750">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dibuat</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {users.map((u) => (
                    <tr key={u.uid} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {u.name}
                        {u.uid === currentUser?.uid && (
                          <span className="ml-2 text-xs text-blue-600">(Anda)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant={u.role === 'administrator' ? 'blue' : 'gray'}>
                          {u.role === 'administrator' ? 'Admin' : 'Operator'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.active ? 'green' : 'red'}>
                          {u.active ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {u.createdAt ? (() => {
                          try { return format(new Date(u.createdAt), 'dd/MM/yyyy'); } catch { return u.createdAt; }
                        })() : '–'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        >
                          <Edit2 size={14} className="text-blue-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Modal */}
        <Modal
          isOpen={showAddModal}
          title="Tambah User Baru"
          onClose={() => { setShowAddModal(false); setAddErrors({}); }}
          footer={
            <>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>Batal</Button>
              <Button onClick={handleAdd} loading={isSaving}>Tambah User</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label="Nama Lengkap"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              error={addErrors.name}
              placeholder="Nama lengkap pengguna"
            />
            <Input
              label="Email"
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              error={addErrors.email}
              placeholder="nama@perusahaan.com"
            />
            <Input
              label="Password"
              type="password"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              error={addErrors.password}
              placeholder="Minimal 6 karakter"
              helperText="User bisa ganti password setelah login pertama"
            />
            <Select
              label="Role"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as UserRole)}
              options={[
                { value: 'operator', label: 'Operator' },
                { value: 'administrator', label: 'Administrator' },
              ]}
            />
          </div>
        </Modal>

        {/* Edit Modal */}
        <Modal
          isOpen={showEditModal}
          title="Edit User"
          onClose={() => { setShowEditModal(false); setEditUser(null); }}
          footer={
            <>
              <Button variant="outline" onClick={() => { setShowEditModal(false); setEditUser(null); }}>Batal</Button>
              <Button onClick={handleEdit} loading={isSaving}>Simpan Perubahan</Button>
            </>
          }
        >
          <div className="space-y-4">
            {selfDeactivateWarning && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={16} />
                <p className="text-sm text-red-700 dark:text-red-400">
                  Anda tidak dapat menonaktifkan akun Anda sendiri.
                </p>
              </div>
            )}
            <Input
              label="Nama Lengkap"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <Select
              label="Role"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as UserRole)}
              options={[
                { value: 'operator', label: 'Operator' },
                { value: 'administrator', label: 'Administrator' },
              ]}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status Akun</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={editActive}
                    onChange={() => { setEditActive(true); setSelfDeactivateWarning(false); }}
                    className="text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Aktif</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!editActive}
                    onChange={() => {
                      if (editUser?.uid === currentUser?.uid) {
                        setSelfDeactivateWarning(true);
                      }
                      setEditActive(false);
                    }}
                    className="text-red-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Nonaktif</span>
                </label>
              </div>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
