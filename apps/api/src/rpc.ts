import { randomUUID } from "crypto";
import { JSONRPCErrorException } from "json-rpc-2.0";
import type { WsClient } from "./ws";
import type { TwitchClient } from "./twitch";

// ── Known events ─────────────────────────────────────────────────────

export const KNOWN_EVENTS = new Set([
  "chat.message",
  "chat.action",
  "chat.sub",
  "chat.resub",
  "chat.sub_gift",
  "chat.community_sub",
  "chat.sub_extend",
  "chat.raid",
  "chat.ban",
  "chat.timeout",
  "chat.message_remove",
  "chat.chat_clear",
  "chat.whisper",
  "chat.announcement",
  "chat.join",
  "chat.part",
  "chat.bits_badge_upgrade",
  // EventSub events
  "eventsub.stream_online",
  "eventsub.stream_offline",
  "eventsub.channel_update",
  "eventsub.channel_follow",
  "eventsub.channel_subscribe",
  "eventsub.channel_subscription_gift",
  "eventsub.channel_subscription_message",
  "eventsub.channel_cheer",
  "eventsub.channel_raid",
  "eventsub.channel_ban",
  "eventsub.channel_unban",
  "eventsub.channel_moderator_add",
  "eventsub.channel_moderator_remove",
  "eventsub.channel_reward_redemption_add",
  "eventsub.channel_poll_begin",
  "eventsub.channel_poll_end",
  "eventsub.channel_prediction_begin",
  "eventsub.channel_prediction_lock",
  "eventsub.channel_prediction_end",
  "eventsub.channel_hype_train_begin",
  "eventsub.channel_hype_train_end",
  "eventsub.channel_shoutout_create",
  "eventsub.channel_shoutout_receive",
  "eventsub.channel_ad_break_begin",
]);

// ── Helper: wrap async calls with error handling ─────────────────────

export function rpcWrap<T>(fn: () => Promise<T>, errorPrefix: string): Promise<T> {
  return fn().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new JSONRPCErrorException(`${errorPrefix}: ${msg}`, -32000);
  });
}

// ── Register RPC methods on a client ─────────────────────────────────

export function registerMethods(client: WsClient, twitch: TwitchClient, subscriptions: Map<string, string>) {
  // ── System ──
  client.rpc.addMethod("ping", () => ({ pong: true }));

  // ── Event subscription ──
  client.rpc.addMethod("event.subscribe", async (params: unknown) => {
    if (!Array.isArray(params)) return null;
    const name = typeof params[0] === "string" ? params[0] : null;
    if (!name || !KNOWN_EVENTS.has(name)) return null;
    for (const [, existingName] of subscriptions) {
      if (existingName === name) return null;
    }
    if (name.startsWith("eventsub.")) {
      const ok = twitch.subscribeEventSub(name);
      if (!ok) return null;
    }
    const subscriptionId = randomUUID();
    subscriptions.set(subscriptionId, name);
    console.log(`[rpc] Subscribed to "${name}" -> ${subscriptionId}`);
    return subscriptionId;
  });

  client.rpc.addMethod("event.unsubscribe", async (params: unknown) => {
    const subId = Array.isArray(params) && typeof params[0] === "string" ? params[0] : null;
    if (subId) {
      const eventName = subscriptions.get(subId);
      subscriptions.delete(subId);
      if (eventName?.startsWith("eventsub.")) {
        const stillUsed = [...subscriptions.values()].some((n) => n === eventName);
        if (!stillUsed) {
          twitch.unsubscribeEventSub(eventName);
        }
      }
      console.log(`[rpc] Unsubscribed ${subId}`);
    }
    return true;
  });

  // ── Chat ──
  client.rpc.addMethod("chat.say", async ({ message, reply_to }: { message?: string; reply_to?: string }) => {
    if (!message) throw new JSONRPCErrorException("Missing required param: message", -32602);
    return rpcWrap(() => twitch.say(message, reply_to).then(() => ({ ok: true })), "Failed to send message");
  });

  client.rpc.addMethod("chat.action", async ({ message }: { message?: string }) => {
    if (!message) throw new JSONRPCErrorException("Missing required param: message", -32602);
    return rpcWrap(() => twitch.action(message).then(() => ({ ok: true })), "Failed to send action");
  });

  // ── Channel ──
  client.rpc.addMethod("channel.get_info", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.getChannelInfo(broadcaster_id), "Failed to get channel info");
  });

  client.rpc.addMethod("channel.update", async ({ broadcaster_id, title, game_id, language, tags }: { broadcaster_id?: string; title?: string; game_id?: string; language?: string; tags?: string[] }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.updateChannelInfo(broadcaster_id, { title, game_id, language, tags }).then(() => ({ ok: true })), "Failed to update channel");
  });

  client.rpc.addMethod("channel.get_follower_count", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.getChannelFollowerCount(broadcaster_id).then((count) => ({ count })), "Failed to get follower count");
  });

  client.rpc.addMethod("channel.start_commercial", async ({ broadcaster_id, length }: { broadcaster_id?: string; length?: number }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!length) throw new JSONRPCErrorException("Missing required param: length", -32602);
    return rpcWrap(() => twitch.startCommercial(broadcaster_id, length).then(() => ({ ok: true })), "Failed to start commercial");
  });

  // ── Streams ──
  client.rpc.addMethod("stream.get_by_user_id", async ({ user_id }: { user_id?: string }) => {
    if (!user_id) throw new JSONRPCErrorException("Missing required param: user_id", -32602);
    return rpcWrap(() => twitch.getStreamByUserId(user_id), "Failed to get stream");
  });

  client.rpc.addMethod("stream.get_by_user_name", async ({ user_name }: { user_name?: string }) => {
    if (!user_name) throw new JSONRPCErrorException("Missing required param: user_name", -32602);
    return rpcWrap(() => twitch.getStreamByUserName(user_name), "Failed to get stream");
  });

  client.rpc.addMethod("stream.create_marker", async ({ broadcaster_id, description }: { broadcaster_id?: string; description?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.createStreamMarker(broadcaster_id, description), "Failed to create stream marker");
  });

  // ── Users ──
  client.rpc.addMethod("user.get_by_id", async ({ user_id }: { user_id?: string }) => {
    if (!user_id) throw new JSONRPCErrorException("Missing required param: user_id", -32602);
    return rpcWrap(() => twitch.getUserById(user_id), "Failed to get user");
  });

  client.rpc.addMethod("user.get_by_name", async ({ user_name }: { user_name?: string }) => {
    if (!user_name) throw new JSONRPCErrorException("Missing required param: user_name", -32602);
    return rpcWrap(() => twitch.getUserByName(user_name), "Failed to get user");
  });

  // ── Games ──
  client.rpc.addMethod("game.get_by_name", async ({ name }: { name?: string }) => {
    if (!name) throw new JSONRPCErrorException("Missing required param: name", -32602);
    return rpcWrap(() => twitch.getGameByName(name), "Failed to get game");
  });

  client.rpc.addMethod("game.get_by_id", async ({ game_id }: { game_id?: string }) => {
    if (!game_id) throw new JSONRPCErrorException("Missing required param: game_id", -32602);
    return rpcWrap(() => twitch.getGameById(game_id), "Failed to get game");
  });

  client.rpc.addMethod("game.get_top", async ({ limit }: { limit?: number }) => {
    return rpcWrap(() => twitch.getTopGames(limit ?? 20), "Failed to get top games");
  });

  // ── Clips ──
  client.rpc.addMethod("clips.create", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.createClip(broadcaster_id), "Failed to create clip");
  });

  client.rpc.addMethod("clips.get", async ({ clip_id }: { clip_id?: string }) => {
    if (!clip_id) throw new JSONRPCErrorException("Missing required param: clip_id", -32602);
    return rpcWrap(() => twitch.getClipById(clip_id), "Failed to get clip");
  });

  // ── Moderation ──
  client.rpc.addMethod("moderation.ban", async ({ broadcaster_id, user_id, reason }: { broadcaster_id?: string; user_id?: string; reason?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!user_id) throw new JSONRPCErrorException("Missing required param: user_id", -32602);
    return rpcWrap(() => twitch.banUser(broadcaster_id, user_id, reason).then(() => ({ ok: true })), "Failed to ban user");
  });

  client.rpc.addMethod("moderation.timeout", async ({ broadcaster_id, user_id, duration, reason }: { broadcaster_id?: string; user_id?: string; duration?: number; reason?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!user_id) throw new JSONRPCErrorException("Missing required param: user_id", -32602);
    if (!duration) throw new JSONRPCErrorException("Missing required param: duration", -32602);
    return rpcWrap(() => twitch.timeoutUser(broadcaster_id, user_id, duration, reason).then(() => ({ ok: true })), "Failed to timeout user");
  });

  client.rpc.addMethod("moderation.unban", async ({ broadcaster_id, user_id }: { broadcaster_id?: string; user_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!user_id) throw new JSONRPCErrorException("Missing required param: user_id", -32602);
    return rpcWrap(() => twitch.unbanUser(broadcaster_id, user_id).then(() => ({ ok: true })), "Failed to unban user");
  });

  client.rpc.addMethod("moderation.get_moderators", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.getModerators(broadcaster_id), "Failed to get moderators");
  });

  client.rpc.addMethod("moderation.get_banned", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.getBannedUsers(broadcaster_id), "Failed to get banned users");
  });

  client.rpc.addMethod("moderation.add_moderator", async ({ broadcaster_id, user_id }: { broadcaster_id?: string; user_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!user_id) throw new JSONRPCErrorException("Missing required param: user_id", -32602);
    return rpcWrap(() => twitch.addModerator(broadcaster_id, user_id).then(() => ({ ok: true })), "Failed to add moderator");
  });

  client.rpc.addMethod("moderation.remove_moderator", async ({ broadcaster_id, user_id }: { broadcaster_id?: string; user_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!user_id) throw new JSONRPCErrorException("Missing required param: user_id", -32602);
    return rpcWrap(() => twitch.removeModerator(broadcaster_id, user_id).then(() => ({ ok: true })), "Failed to remove moderator");
  });

  client.rpc.addMethod("moderation.delete_messages", async ({ broadcaster_id, message_id }: { broadcaster_id?: string; message_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.deleteChatMessages(broadcaster_id, message_id).then(() => ({ ok: true })), "Failed to delete messages");
  });

  client.rpc.addMethod("moderation.shield_mode_status", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.shieldModeStatus(broadcaster_id), "Failed to get shield mode status");
  });

  client.rpc.addMethod("moderation.update_shield_mode", async ({ broadcaster_id, activate }: { broadcaster_id?: string; activate?: boolean }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (activate === undefined) throw new JSONRPCErrorException("Missing required param: activate", -32602);
    return rpcWrap(() => twitch.updateShieldMode(broadcaster_id, activate), "Failed to update shield mode");
  });

  // ── Polls ──
  client.rpc.addMethod("polls.create", async ({ broadcaster_id, title, choices, duration }: { broadcaster_id?: string; title?: string; choices?: string[]; duration?: number }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!title) throw new JSONRPCErrorException("Missing required param: title", -32602);
    if (!choices || choices.length < 2) throw new JSONRPCErrorException("choices must have at least 2 items", -32602);
    if (!duration) throw new JSONRPCErrorException("Missing required param: duration", -32602);
    return rpcWrap(() => twitch.createPoll(broadcaster_id, title, choices, duration), "Failed to create poll");
  });

  client.rpc.addMethod("polls.end", async ({ broadcaster_id, poll_id, show_result }: { broadcaster_id?: string; poll_id?: string; show_result?: boolean }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!poll_id) throw new JSONRPCErrorException("Missing required param: poll_id", -32602);
    return rpcWrap(() => twitch.endPoll(broadcaster_id, poll_id, show_result ?? true), "Failed to end poll");
  });

  // ── Predictions ──
  client.rpc.addMethod("predictions.create", async ({ broadcaster_id, title, outcomes, duration }: { broadcaster_id?: string; title?: string; outcomes?: string[]; duration?: number }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!title) throw new JSONRPCErrorException("Missing required param: title", -32602);
    if (!outcomes || outcomes.length < 2) throw new JSONRPCErrorException("outcomes must have at least 2 items", -32602);
    if (!duration) throw new JSONRPCErrorException("Missing required param: duration", -32602);
    return rpcWrap(() => twitch.createPrediction(broadcaster_id, title, outcomes, duration), "Failed to create prediction");
  });

  client.rpc.addMethod("predictions.lock", async ({ broadcaster_id, prediction_id }: { broadcaster_id?: string; prediction_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!prediction_id) throw new JSONRPCErrorException("Missing required param: prediction_id", -32602);
    return rpcWrap(() => twitch.lockPrediction(broadcaster_id, prediction_id), "Failed to lock prediction");
  });

  client.rpc.addMethod("predictions.resolve", async ({ broadcaster_id, prediction_id, outcome_id }: { broadcaster_id?: string; prediction_id?: string; outcome_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!prediction_id) throw new JSONRPCErrorException("Missing required param: prediction_id", -32602);
    if (!outcome_id) throw new JSONRPCErrorException("Missing required param: outcome_id", -32602);
    return rpcWrap(() => twitch.resolvePrediction(broadcaster_id, prediction_id, outcome_id), "Failed to resolve prediction");
  });

  client.rpc.addMethod("predictions.cancel", async ({ broadcaster_id, prediction_id }: { broadcaster_id?: string; prediction_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!prediction_id) throw new JSONRPCErrorException("Missing required param: prediction_id", -32602);
    return rpcWrap(() => twitch.cancelPrediction(broadcaster_id, prediction_id), "Failed to cancel prediction");
  });

  // ── Raids ──
  client.rpc.addMethod("raids.start", async ({ from_id, to_id }: { from_id?: string; to_id?: string }) => {
    if (!from_id) throw new JSONRPCErrorException("Missing required param: from_id", -32602);
    if (!to_id) throw new JSONRPCErrorException("Missing required param: to_id", -32602);
    return rpcWrap(() => twitch.startRaid(from_id, to_id), "Failed to start raid");
  });

  client.rpc.addMethod("raids.cancel", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.cancelRaid(broadcaster_id).then(() => ({ ok: true })), "Failed to cancel raid");
  });

  // ── Search ──
  client.rpc.addMethod("search.channels", async ({ query, limit }: { query?: string; limit?: number }) => {
    if (!query) throw new JSONRPCErrorException("Missing required param: query", -32602);
    return rpcWrap(() => twitch.searchChannels(query, limit ?? 20), "Failed to search channels");
  });

  client.rpc.addMethod("search.categories", async ({ query, limit }: { query?: string; limit?: number }) => {
    if (!query) throw new JSONRPCErrorException("Missing required param: query", -32602);
    return rpcWrap(() => twitch.searchCategories(query, limit ?? 20), "Failed to search categories");
  });

  // ── Whispers ──
  client.rpc.addMethod("whispers.send", async ({ from_id, to_id, message }: { from_id?: string; to_id?: string; message?: string }) => {
    if (!from_id) throw new JSONRPCErrorException("Missing required param: from_id", -32602);
    if (!to_id) throw new JSONRPCErrorException("Missing required param: to_id", -32602);
    if (!message) throw new JSONRPCErrorException("Missing required param: message", -32602);
    return rpcWrap(() => twitch.sendWhisper(from_id, to_id, message).then(() => ({ ok: true })), "Failed to send whisper");
  });

  // ── Channel Points ──
  client.rpc.addMethod("channel_points.get_rewards", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.getCustomRewards(broadcaster_id), "Failed to get rewards");
  });

  client.rpc.addMethod("channel_points.create_reward", async ({ broadcaster_id, title, cost, prompt, is_enabled, background_color, auto_fulfill }: { broadcaster_id?: string; title?: string; cost?: number; prompt?: string; is_enabled?: boolean; background_color?: string; auto_fulfill?: boolean }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!title) throw new JSONRPCErrorException("Missing required param: title", -32602);
    if (cost === undefined) throw new JSONRPCErrorException("Missing required param: cost", -32602);
    return rpcWrap(() => twitch.createCustomReward(broadcaster_id, { title, cost, prompt, is_enabled, background_color, auto_fulfill }), "Failed to create reward");
  });

  // ── VIPs ──
  client.rpc.addMethod("vips.get", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.getVips(broadcaster_id), "Failed to get VIPs");
  });

  client.rpc.addMethod("vips.add", async ({ broadcaster_id, user_id }: { broadcaster_id?: string; user_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!user_id) throw new JSONRPCErrorException("Missing required param: user_id", -32602);
    return rpcWrap(() => twitch.addVip(broadcaster_id, user_id).then(() => ({ ok: true })), "Failed to add VIP");
  });

  client.rpc.addMethod("vips.remove", async ({ broadcaster_id, user_id }: { broadcaster_id?: string; user_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!user_id) throw new JSONRPCErrorException("Missing required param: user_id", -32602);
    return rpcWrap(() => twitch.removeVip(broadcaster_id, user_id).then(() => ({ ok: true })), "Failed to remove VIP");
  });

  // ── Chat API ──
  client.rpc.addMethod("chat.get_chatters", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.getChatters(broadcaster_id), "Failed to get chatters");
  });

  client.rpc.addMethod("chat.send_announcement", async ({ broadcaster_id, message, color }: { broadcaster_id?: string; message?: string; color?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    if (!message) throw new JSONRPCErrorException("Missing required param: message", -32602);
    return rpcWrap(() => twitch.sendAnnouncement(broadcaster_id, message, color).then(() => ({ ok: true })), "Failed to send announcement");
  });

  client.rpc.addMethod("chat.shoutout", async ({ from_id, to_id }: { from_id?: string; to_id?: string }) => {
    if (!from_id) throw new JSONRPCErrorException("Missing required param: from_id", -32602);
    if (!to_id) throw new JSONRPCErrorException("Missing required param: to_id", -32602);
    return rpcWrap(() => twitch.shoutoutUser(from_id, to_id).then(() => ({ ok: true })), "Failed to shoutout");
  });

  // ── Subscriptions ──
  client.rpc.addMethod("subscriptions.get_count", async ({ broadcaster_id }: { broadcaster_id?: string }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.getSubscriptionCount(broadcaster_id), "Failed to get subscription count");
  });

  // ── Bits ──
  client.rpc.addMethod("bits.get_leaderboard", async ({ broadcaster_id, count }: { broadcaster_id?: string; count?: number }) => {
    if (!broadcaster_id) throw new JSONRPCErrorException("Missing required param: broadcaster_id", -32602);
    return rpcWrap(() => twitch.getBitsLeaderboard(broadcaster_id, count ?? 10), "Failed to get bits leaderboard");
  });
}
