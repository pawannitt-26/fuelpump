import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { params } = context;
    const { id } = await params;
    
    const { data, error } = await supabase
      .from('decantations')
      .select('*, manager:manager_id(id, name), approver:approved_by(id, name)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching decantation:', error);
      return NextResponse.json({ error: 'Failed to fetch decantation' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { params } = context;
    const { id } = await params;
    const body = await request.json();

    // Ensure we don't update status through this route
    const { status, ...updateData } = body;

    // Check if it's already approved
    const { data: existingData } = await supabase
      .from('decantations')
      .select('status')
      .eq('id', id)
      .single();

    if (existingData?.status === 'Approved') {
      return NextResponse.json({ error: 'Cannot edit an approved form' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('decantations')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating decantation:', error);
      return NextResponse.json({ error: 'Failed to update decantation form' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
