import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { params } = context;
    const { id } = await params;
    const body = await request.json();
    const { approved_by } = body;

    if (!approved_by) {
      return NextResponse.json({ error: 'approved_by is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('decantations')
      .update({
        status: 'Approved',
        approved_by,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error approving decantation:', error);
      return NextResponse.json({ error: 'Failed to approve decantation form' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
