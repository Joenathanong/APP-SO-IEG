'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { AppUser } from '@/types';

const SESSION_KEY = 'so_session';

// Batas sesi 1 jam DIHAPUS atas permintaan. Sesi kini bertahan sampai operator
// menekan Logout, atau sampai Firebase sendiri mencabut kredensialnya.
//
// Catatan: `so_session` tetap disimpan (hanya berisi waktu login) supaya
// pembersihan saat logout tetap konsisten dan waktu mulai sesi bisa ditampilkan.

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setFirebaseUser(null);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('so_shift');
  }, []);

  const loadUserProfile = async (fbUser: FirebaseUser): Promise<AppUser | null> => {
    const docRef = doc(db, 'users', fbUser.uid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { uid: fbUser.uid, ...docSnap.data() } as AppUser;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const profile = await loadUserProfile(fbUser);
          if (!profile) {
            await logout();
            setLoading(false);
            return;
          }
          if (!profile.active) {
            await logout();
            setLoading(false);
            return;
          }
          setFirebaseUser(fbUser);
          setUser(profile);
        } catch (e) {
          console.error('Failed to load user profile', e);
          await logout();
        }
      } else {
        setUser(null);
        setFirebaseUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [logout]);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await loadUserProfile(cred.user);
    
    if (!profile) {
      await signOut(auth);
      throw new Error('Profil pengguna tidak ditemukan.');
    }
    if (!profile.active) {
      await signOut(auth);
      throw new Error('Akun dinonaktifkan. Hubungi administrator.');
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({ loginTime: Date.now() }));

    setFirebaseUser(cred.user);
    setUser(profile);
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
