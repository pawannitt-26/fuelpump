"use client";

import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/lib/supabase';
import { Bell, Check, BellRing } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: string;
    link?: string;
    is_read: boolean;
    created_at: string;
}

export default function NotificationCenter() {
    const { user } = useAppStore();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Only Admins get notifications (based on our current plan)
    const isAdmin = user?.role === 'Admin';

    useEffect(() => {
        if (!user || (!isAdmin)) return;

        // Fetch initial notifications
        const fetchNotifications = async () => {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const isoString = threeDaysAgo.toISOString();

            const { data } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .gte('created_at', isoString)
                .order('created_at', { ascending: false })
                .limit(20);

            if (data) {
                setNotifications(data);
                setUnreadCount(data.filter(n => !n.is_read).length);
            }
        };

        fetchNotifications();

        // Check if push is already enabled in browser
        if ('Notification' in window && 'serviceWorker' in navigator) {
            if (Notification.permission === 'granted') {
                setPushEnabled(true);
            }
        }

        // Subscribe to real-time notification inserts
        const channel = supabase.channel(`notifications:user_id=eq.${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, (payload) => {
                const newNotif = payload.new as Notification;
                setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
                setUnreadCount((prev) => prev + 1);
            })
            .subscribe();

        // Close dropdown when clicking outside
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        // Close dropdown when scrolling
        const handleScroll = () => {
            if (isOpen) {
                setIsOpen(false);
            }
        };
        
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            supabase.removeChannel(channel);
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [user, isAdmin, isOpen]);

    if (!isAdmin) return null;

    const markAsRead = async (id?: string) => {
        if (!id) {
            // Mark all as read
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', user?.id)
                .eq('is_read', false);

            if (!error) {
                setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                setUnreadCount(0);
            }
        } else {
            // Mark specific as read
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', id);

            if (!error) {
                setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        }
    };

    const deleteNotification = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation(); // Prevent triggering the wrapper's markAsRead
        
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', id);

        if (!error) {
            setNotifications(prev => prev.filter(n => n.id !== id));
            
            const notif = notifications.find(n => n.id === id);
            if (notif && !notif.is_read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        }
    };

    const enablePushNotifications = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            alert('Push notifications not supported by your browser.');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('Notification permission denied.');
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            
            // Convert VAPID key to Uint8Array
            const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey!);

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });

            // Send subscription to backend
            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription,
                    userId: user?.id
                })
            });

            if (res.ok) {
                setPushEnabled(true);
            } else {
                console.error('Failed to save subscription details');
            }
        } catch (error) {
            console.error('Error enabling push notifications:', error);
        }
    };

    // Helper function for VAPID key encoding
    function urlBase64ToUint8Array(base64String: string) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                aria-label="Notifications"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white"></span>
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden select-none">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            Notifications {unreadCount > 0 && <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">{unreadCount}</span>}
                        </h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => markAsRead()}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 transition-colors"
                            >
                                <Check size={14} /> Mark all read
                            </button>
                        )}
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                                    <Bell size={20} className="text-slate-300" />
                                </div>
                                <p className="text-sm font-medium">No notifications yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {notifications.map(notif => (
                                    <div
                                        key={notif.id}
                                        className={`p-4 transition-colors hover:bg-slate-50 cursor-pointer ${!notif.is_read ? 'bg-blue-50/30' : ''}`}
                                        onClick={() => {
                                            if (!notif.is_read) markAsRead(notif.id);
                                            // Optional: If there's a link, we could programmatically route, 
                                            // but since we render a Link if needed, we'll let Link handle navigation.
                                        }}
                                    >
                                        <div className="flex gap-3">
                                            <div className="mt-0.5 shrink-0">
                                                {!notif.is_read ? (
                                                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                                                ) : (
                                                    <div className="w-2 h-2 rounded-full bg-transparent mt-1.5" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <p className={`text-sm font-semibold truncate ${!notif.is_read ? 'text-slate-800' : 'text-slate-600'}`}>
                                                        {notif.title}
                                                    </p>
                                                    <span className="text-[10px] text-slate-400 shrink-0 capitalize">
                                                        {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                                    {notif.message}
                                                </p>
                                                {notif.link && (
                                                    <Link 
                                                        href={notif.link} 
                                                        onClick={(e) => deleteNotification(notif.id, e)}
                                                        className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                                                    >
                                                        View Details &rarr;
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {!pushEnabled && (
                        <div className="p-3 border-t border-slate-100 bg-blue-50/50">
                            <button
                                onClick={enablePushNotifications}
                                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white border border-blue-200 text-blue-600 hover:bg-blue-600 hover:border-blue-600 hover:text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                            >
                                <BellRing size={14} /> Enable Desktop Alerts
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
