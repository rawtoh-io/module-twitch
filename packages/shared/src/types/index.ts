// ── Event payload types ──────────────────────────────────────────────

export interface ChatMessageEvent {
  id: string;
  channel: string;
  channel_id: string | null;
  user_id: string;
  username: string;
  display_name: string;
  message: string;
  timestamp: number;
  color: string | null;
  is_cheer: boolean;
  bits: number;
  is_first: boolean;
  is_returning_chatter: boolean;
  is_reply: boolean;
  parent_message_id: string | null;
  parent_message_text: string | null;
  is_broadcaster: boolean;
  is_mod: boolean;
  is_subscriber: boolean;
  is_vip: boolean;
}

export interface ChatSubEvent {
  channel: string;
  user_id: string;
  username: string;
  display_name: string;
  plan: string;
  plan_name: string;
  is_prime: boolean;
  months: number;
  streak: number | null;
  message: string | null;
}

export interface ChatSubGiftEvent {
  channel: string;
  user_id: string;
  username: string;
  display_name: string;
  plan: string;
  plan_name: string;
  months: number;
  gift_duration: number;
  gifter: string | null;
  gifter_user_id: string | null;
  gifter_display_name: string | null;
  gifter_gift_count: number | null;
}

export interface ChatCommunitySubEvent {
  channel: string;
  username: string;
  count: number;
  plan: string;
  gifter: string | null;
  gifter_user_id: string | null;
  gifter_display_name: string | null;
  gifter_gift_count: number | null;
}

export interface ChatRaidEvent {
  channel: string;
  username: string;
  display_name: string;
  viewer_count: number;
}

export interface ChatBanEvent {
  channel: string;
  username: string;
}

export interface ChatTimeoutEvent {
  channel: string;
  username: string;
  duration: number;
}

export interface ChatMessageRemoveEvent {
  channel: string;
  message_id: string;
}

export interface ChatClearEvent {
  channel: string;
}

export interface ChatWhisperEvent {
  username: string;
  message: string;
}

export interface ChatAnnouncementEvent {
  channel: string;
  username: string;
  message: string;
  color: string;
}

export interface ChatJoinEvent {
  channel: string;
  username: string;
}

export interface ChatPartEvent {
  channel: string;
  username: string;
}

export interface ChatActionEvent {
  id: string;
  channel: string;
  channel_id: string | null;
  user_id: string;
  username: string;
  display_name: string;
  message: string;
  timestamp: number;
  color: string | null;
  is_broadcaster: boolean;
  is_mod: boolean;
  is_subscriber: boolean;
  is_vip: boolean;
}

export interface ChatSubExtendEvent {
  channel: string;
  user_id: string;
  username: string;
  display_name: string;
  plan: string;
  months: number;
  end_month: number;
}

export interface ChatBitsBadgeUpgradeEvent {
  channel: string;
  username: string;
  display_name: string;
  threshold: number;
}

// ── Generic event handler ────────────────────────────────────────────

export type EventHandler = (eventName: string, data: unknown) => void;
