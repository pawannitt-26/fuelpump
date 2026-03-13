import { create } from 'zustand';
import { persist } from 'zustand/middleware'; interface AppState {
  language: 'en' | 'hi';
  setLanguage: (lang: 'en' | 'hi') => void;

  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;

  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (isCollapsed: boolean) => void;

  // Placeholder for User Session
  user: { id: string; name: string; role: 'Admin' | 'Manager' } | null;
  setUser: (user: { id: string; name: string; role: 'Admin' | 'Manager' } | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (lang) => set({ language: lang }),

      sidebarOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),

      sidebarCollapsed: false,
      toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (isCollapsed) => set({ sidebarCollapsed: isCollapsed }),

      user: null, // Default to null initially until login
      setUser: (user) => set({ user }),
    }),
    {
      name: 'fuel-station-storage', // name of the item in the storage (must be unique)
      // Only persist the user, language, and the standard sidebar collapsed state
      partialize: (state) => ({ user: state.user, language: state.language, sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
);
