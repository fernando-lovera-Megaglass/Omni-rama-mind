import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Atomic predecessor filters prevent late REST responses and unordered webhooks
// from reverting delivery receipts. Terminal results are immutable.
const predecessors: Record<string, string[]> = {
  accepted: ['queued', 'accepted'],
  queued: ['queued', 'accepted'],
  sending: ['queued', 'accepted', 'sending'],
  sent: ['queued', 'accepted', 'sending', 'sent'],
  delivered: ['queued', 'accepted', 'sending', 'sent'],
  read: ['queued', 'accepted', 'sending', 'sent', 'delivered'],
  failed: ['queued', 'accepted', 'sending', 'sent'],
  undelivered: ['queued', 'accepted', 'sending', 'sent'],
  canceled: ['queued', 'accepted', 'sending'],
};

export const messageStatusKnown = (status: string): boolean => Object.hasOwn(predecessors, status);

export function messageError(code?: string | number | null, message?: string | null): string | null {
  return [code == null || code === '' ? null : `Twilio ${code}`, message].filter(Boolean).join(': ') || null;
}

export async function applyMessageStatus(service: SupabaseClient, id: string, connectionId: string, sid: string, status: string, error: string | null): Promise<void> {
  if (!messageStatusKnown(status)) throw new Error(`Estado de mensaje desconocido: ${status}`);
  const { error: dbError } = await service.from('twilio_messages').update({ message_sid: sid, status, error })
    .eq('id', id).eq('connection_id', connectionId).eq('direction', 'outbound')
    .or(`message_sid.is.null,message_sid.eq.${sid}`).in('status', predecessors[status]);
  if (dbError) throw dbError;
}
