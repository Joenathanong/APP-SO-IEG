'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { ShiftType } from '@/types';

interface ShiftContextType {
  shift: ShiftType | null;
  setShift: (shift: ShiftType) => void;
  clearShift: () => void;
}

const ShiftContext = createContext<ShiftContextType>({} as ShiftContextType);

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const [shift, setShiftState] = useState<ShiftType | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('so_shift');
    if (stored) setShiftState(stored as ShiftType);
  }, []);

  const setShift = (s: ShiftType) => {
    setShiftState(s);
    localStorage.setItem('so_shift', s);
  };

  const clearShift = () => {
    setShiftState(null);
    localStorage.removeItem('so_shift');
  };

  return (
    <ShiftContext.Provider value={{ shift, setShift, clearShift }}>
      {children}
    </ShiftContext.Provider>
  );
}

export const useShift = () => useContext(ShiftContext);
