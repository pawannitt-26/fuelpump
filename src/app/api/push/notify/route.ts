import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import webpush from 'web-push';

// Configure Web Push with VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@local.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
  process.env.VAPID_PRIVATE_KEY as string
);

export async function POST(req: NextRequest) {
    try {
        const { title, message, type, link, triggeringUserId } = await req.json();

        // 1. Fetch all Admin users
        const { data: admins } = await supabase
            .from('users')
            .select('id')
            .eq('role', 'Admin');

        if (!admins || admins.length === 0) {
            return NextResponse.json({ message: 'No admins found' });
        }

        const adminIds = admins.map(a => a.id);

        // 2. Insert In-App Notifications for all Admins
        const notificationInserts = adminIds.map(adminId => ({
            user_id: adminId,
            title,
            message,
            type,
            link
        }));

        const { error: notifError } = await supabase
            .from('notifications')
            .insert(notificationInserts);

        if (notifError) {
            console.error('Error inserting notifications:', notifError);
        }

        // 3. Fetch Push Subscriptions for these admins
        const { data: subscriptions } = await supabase
            .from('push_subscriptions')
            .select('*')
            .in('user_id', adminIds);

        if (subscriptions && subscriptions.length > 0) {
            const pushPayload = JSON.stringify({
                title,
                body: message,
                url: link || '/',
            });

            // Iterate and send push to all endpoints
            const pushPromises = subscriptions.map(async (sub) => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth
                    }
                };

                try {
                    await webpush.sendNotification(pushSubscription, pushPayload);
                } catch (err: any) {
                    console.error(`Failed to send push to ${sub.endpoint}:`, err);
                    // Standard cleanup on 404/410 Gone status
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                    }
                }
            });

            await Promise.all(pushPromises);
        }

        return NextResponse.json({ success: true, deliveries: subscriptions?.length || 0 });

    } catch (err: any) {
        console.error('Notify Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
