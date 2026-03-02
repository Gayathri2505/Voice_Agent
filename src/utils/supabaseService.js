// supabaseService.js
// ─────────────────────────────────────────────────────────────────────────────
// Handles all Supabase interactions for voice session tracking + chat history.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabaseClient';

// ─── 1. Create session row when call starts ───────────────────────────────────
export async function createSession(sessionId) {
  const { error } = await supabase
    .from('sessions')
    .insert({
      session_id: sessionId,
      started_at: new Date().toISOString(),
      status:     'attending',
    });

  if (error) {
    console.error('[Supabase] createSession failed:', error.message);
    return null;
  }

  console.log('[Supabase] Session created:', sessionId);
  return true;
}

// ─── 2. Close session row when call ends ─────────────────────────────────────
export async function closeSession(sessionId, {
  startedAt,
  handoffTriggered = false,
  handoffReason    = null,
  metadata         = null,
} = {}) {
  const endedAt         = new Date();
  const durationSeconds = Math.round((endedAt - startedAt) / 1000);
  const status          = handoffTriggered ? 'handed_off' : 'completed';

  const { error } = await supabase
    .from('sessions')
    .update({
      ended_at:          endedAt.toISOString(),
      duration_seconds:  durationSeconds,
      status,
      handoff_triggered: handoffTriggered,
      handoff_reason:    handoffReason,
      metadata,
      updated_at:        endedAt.toISOString(),
    })
    .eq('session_id', sessionId);

  if (error) {
    console.error('[Supabase] closeSession failed:', error.message);
    return null;
  }

  console.log(`[Supabase] Session closed → ${status} (${durationSeconds}s)`);
  return true;
}

// ─── 3. Flag a handoff mid-session ───────────────────────────────────────────
export async function flagHandoff(sessionId, reason = null) {
  const { error } = await supabase
    .from('sessions')
    .update({
      handoff_triggered: true,
      handoff_reason:    reason,
      updated_at:        new Date().toISOString(),
    })
    .eq('session_id', sessionId);

  if (error) {
    console.error('[Supabase] flagHandoff failed:', error.message);
  }
}

// ─── 4. Create customer_info row when session starts ─────────────────────────
export async function createCustomerInfo(sessionId) {
  const { error } = await supabase
    .from('customer_info')
    .insert({
      session_id: sessionId,
      status:     'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[Supabase] createCustomerInfo failed:', error.message);
    return null;
  }

  console.log('[Supabase] Customer info row created for:', sessionId);
  return true;
}

// ─── 5. Save a single chat message ───────────────────────────────────────────
// Inserts one row into n8n_chat_histories.
// type must be 'human' or 'ai' — matches n8n memory node format exactly.
//
// IMPORTANT: Always call this sequentially (await), never in parallel with
// another saveChatMessage. The serial `id` column determines order, so
// parallel inserts cause unpredictable ordering.
async function saveChatMessage(sessionId, type, text) {
  const { error } = await supabase
    .from('n8n_chat_histories')
    .insert({
      session_id: sessionId,
      message:    { type, content: text },
    });

  if (error) {
    console.error(`[Supabase] saveChatMessage (${type}) failed:`, error.message);
  }
}

// ─── 6. Save a greeting (AI message at session start) ────────────────────────
// Call once after the opening greeting is spoken.
export async function saveGreeting(sessionId, greetingText) {
  await saveChatMessage(sessionId, 'ai', greetingText);
}

// ─── 7. Save a full conversation turn in correct order ───────────────────────
// Inserts human message FIRST, then AI message.
// Sequential — never parallel — so serial ids always reflect conversation order.
export async function saveChatTurn(sessionId, userText, aiText) {
  await saveChatMessage(sessionId, 'human', userText);
  await saveChatMessage(sessionId, 'ai',    aiText);
}