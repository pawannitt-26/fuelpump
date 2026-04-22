import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('decantations')
      .select('*, manager:manager_id(id, name), approver:approved_by(id, name)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching decantations:', error);
      return NextResponse.json({ error: 'Failed to fetch decantations' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Default to 'Pending'
    const payload = {
      ...body,
      status: 'Pending'
    };

    const { data, error } = await supabase
      .from('decantations')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error creating decantation:', error);
      return NextResponse.json({ error: 'Failed to create decantation form' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
