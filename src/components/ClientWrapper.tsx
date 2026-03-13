"use client";

import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { useEffect, useState } from 'react';

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, sidebarCollapsed } = useAppStore();
    const isHome = pathname === '/';
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (!isHome && !user) {
            router.replace('/');
        }
    }, [isHome, user, router]);

    if (!mounted) return null;
    if (!isHome && !user) return null;

    if (isHome) {
        return <main className="bg-slate-50 min-h-screen content-center">{children}</main>;
    }

    return (
        <div className="app-container bg-slate-50 min-h-screen font-sans text-slate-800">
            <Sidebar />
            <main className={`main-content ${sidebarCollapsed ? 'expanded' : ''} transition-all duration-300`}>
                <Header />
                <div className="page-content bg-white min-h-[calc(100dvh-96px)] lg:rounded-tl-2xl shadow-sm lg:border-l border-t mt-0">
                    {children}
                </div>
            </main>
        </div>
    );
}
